import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Subject } from '../../generated/prisma/client';
import { PrismaService } from '../common/prisma.service';
import { VerifyService } from '../verify/verify.service';

function extractError(e: unknown): string {
  return e instanceof Error && e.message ? e.message : 'Verification failed';
}

/** result field → billing type used in the subject's verificationLog. */
const FIELD_TO_BILL_TYPE: Record<string, string> = {
  panResult: 'pan',
  aadhaarResult: 'aadhaar',
  crimeResult: 'crime',
  dlResult: 'dl',
  voterResult: 'voter',
  passportResult: 'passport',
  employmentResult: 'employment',
  creditResult: 'credit',
};

/**
 * Auto-runs verification checks for a candidate **after payment**. It only ever
 * runs the checks the provided data supports — e.g. no DOB ⇒ no crime/credit —
 * and never re-runs a check whose result is already stored (idempotent). It's
 * fire-and-forget: the payment/create response never waits on a vendor call.
 *
 * Aadhaar (DigiLocker) is deliberately NOT here — it needs the candidate to
 * authenticate with DigiLocker, so it stays candidate-driven in /candidate.
 */
@Injectable()
export class SubjectVerificationService {
  private readonly logger = new Logger(SubjectVerificationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly verify: VerifyService,
  ) {}

  /** Kick off auto-checks for a freshly-created (paid) subject. Non-blocking. */
  runForSubject(subjectId: string): void {
    void this.run(subjectId).catch((e) =>
      this.logger.error(
        `auto-checks failed for subject ${subjectId}: ${
          e instanceof Error ? e.message : e
        }`,
      ),
    );
  }

  private async run(subjectId: string): Promise<void> {
    const s = await this.prisma.subject.findUnique({ where: { id: subjectId } });
    if (!s) return;

    // ── Synchronous Surepass ID checks — call + store immediately. Each runs
    //    only when its required fields are present and it hasn't run yet. ──
    await this.runSync(
      s.id,
      'PAN',
      Boolean(s.panNumber) && !s.panResult,
      'panResult',
      () => this.verify.pan(s.panNumber!.toUpperCase()),
    );
    await this.runSync(
      s.id,
      'Voter ID',
      Boolean(s.voterId) && !s.voterResult,
      'voterResult',
      () => this.verify.voterId(s.voterId!.toUpperCase()),
    );
    await this.runSync(
      s.id,
      'Passport',
      Boolean(s.passportFileNo && s.dob) && !s.passportResult,
      'passportResult',
      () => this.verify.passport(s.passportFileNo!.toUpperCase(), s.dob!),
    );
    await this.runSync(
      s.id,
      'Driving licence',
      Boolean(s.drivingLicense && s.dob) && !s.dlResult,
      'dlResult',
      () => this.verify.drivingLicense(s.drivingLicense!.toUpperCase(), s.dob!),
    );
    await this.runSync(
      s.id,
      'Employment',
      Boolean(s.uan) && !s.employmentResult,
      'employmentResult',
      () => this.verify.employmentHistory(s.uan!),
    );

    // ── Credit — needs PAN + address. Async (BGV): initiate, then poll. The
    //    bureau wants a structured address; we pass the free-text line + pincode
    //    as best-effort (may be rejected until structured address is captured). ──
    if (
      s.panNumber &&
      s.dob &&
      s.permanentAddress &&
      !s.creditRequestId &&
      !s.creditResult
    ) {
      try {
        const resp = (await this.verify.creditCheck({
          name: s.name,
          fatherName: s.fatherName || undefined,
          dob: s.dob,
          panNumber: s.panNumber.toUpperCase(),
          street: s.permanentAddress,
          city: '',
          state: '',
          pincode: s.pincode || '',
        })) as Record<string, unknown>;
        const caseId = this.firstCaseId(resp);
        if (caseId) {
          await this.prisma.subject.update({
            where: { id: s.id },
            data: { creditRequestId: caseId },
          });
          this.pollCredit(s.id, caseId, 0);
          this.logger.log(`Credit check initiated for ${s.id} (${caseId})`);
        }
      } catch (e) {
        this.logger.warn(
          `Credit check failed for ${s.id}: ${
            e instanceof Error ? e.message : e
          }`,
        );
      }
    }

    // ── Crime — needs name + DOB + address. Async: initiate, then poll. ──
    if (s.name && s.dob && s.permanentAddress && !s.crimeRequestId && !s.crimeResult) {
      try {
        const resp = (await this.verify.crimeCheck({
          name: s.name,
          fatherName: s.fatherName || undefined,
          dob: s.dob,
          address: s.permanentAddress || undefined,
          panNumber: s.panNumber || undefined,
        })) as Record<string, unknown>;
        const requestId =
          (resp?.request_id as string | undefined) ??
          ((resp?.data as Record<string, unknown> | undefined)?.request_id as
            | string
            | undefined);
        if (requestId) {
          await this.prisma.subject.update({
            where: { id: s.id },
            data: { crimeRequestId: String(requestId) },
          });
          this.pollCrime(s.id, String(requestId), 0);
          this.logger.log(`Crime check initiated for ${s.id} (${requestId})`);
        }
      } catch (e) {
        this.logger.warn(
          `Crime check failed for ${s.id}: ${
            e instanceof Error ? e.message : e
          }`,
        );
      }
    }

    // ── Credit — needs PAN + DOB + a *structured* address (street/city/state/
    // pincode). Assurio only captures a free-text address today, which the
    // credit bureau rejects, so credit is intentionally NOT auto-run yet.
    // Once structured address is collected, add a branch here mirroring crime.
  }

  /** Poll the crime report until it completes, then store it. Best-effort. */
  private pollCrime(subjectId: string, requestId: string, attempt: number): void {
    if (attempt > 40) {
      this.logger.warn(`Crime poll gave up for ${subjectId} (${requestId})`);
      return;
    }
    setTimeout(() => {
      void (async () => {
        try {
          const report = (await this.verify.crimeCheckReport(
            requestId,
          )) as Record<string, unknown>;
          const data =
            (report?.data as Record<string, unknown> | undefined) ?? report;
          const status =
            (report?.status as string | undefined) ??
            (data?.status as string | undefined);
          const done =
            status === 'completed' ||
            status === 'done' ||
            Boolean(data?.risk_assessment) ||
            Boolean(data?.cases);
          if (done) {
            await this.prisma.subject.update({
              where: { id: subjectId },
              data: { crimeResult: { data } as object },
            });
            this.logger.log(`Crime report stored for ${subjectId}`);
          } else {
            this.pollCrime(subjectId, requestId, attempt + 1);
          }
        } catch {
          this.pollCrime(subjectId, requestId, attempt + 1);
        }
      })();
    }, 5000);
  }

  /** Run one synchronous check + store its result under `field`. Best-effort. */
  private async runSync(
    subjectId: string,
    label: string,
    shouldRun: boolean,
    field:
      | 'panResult'
      | 'voterResult'
      | 'passportResult'
      | 'dlResult'
      | 'employmentResult',
    call: () => Promise<unknown>,
  ): Promise<void> {
    if (!shouldRun) return;
    try {
      const result = await call();
      await this.storeResult(subjectId, field, result);
      this.logger.log(`${label} check done for ${subjectId}`);
    } catch (e) {
      // A genuine 4xx outcome (invalid / not found) is a real result — store
      // the vendor's message so the UI shows it. Transient 5xx/network errors
      // are left pending so a recall can retry.
      if (e instanceof BadRequestException) {
        await this.storeError(subjectId, field, extractError(e));
      }
      this.logger.warn(
        `${label} check failed for ${subjectId}: ${
          e instanceof Error ? e.message : e
        }`,
      );
    }
  }

  /** Persist a genuine verification failure so the UI can show it. Not billed. */
  private async storeError(
    subjectId: string,
    field: string,
    message: string,
  ): Promise<Subject> {
    return this.prisma.subject.update({
      where: { id: subjectId },
      data: { [field]: { __checkError: message } } as Record<string, unknown>,
    });
  }

  /**
   * Store a check result AND append a billing entry to the subject's
   * verificationLog — one entry per real vendor call, so every run (including a
   * "Recall API") is counted in the per-client API cost. Returns the updated
   * subject.
   */
  private async storeResult(
    subjectId: string,
    field: string,
    result: unknown,
  ): Promise<Subject> {
    const type = FIELD_TO_BILL_TYPE[field];
    const cur = await this.prisma.subject.findUnique({
      where: { id: subjectId },
      select: { verificationLog: true },
    });
    const log = Array.isArray(cur?.verificationLog)
      ? (cur!.verificationLog as unknown[])
      : [];
    const entry = type
      ? [{ type, calledAt: new Date().toISOString() }]
      : [];
    return this.prisma.subject.update({
      where: { id: subjectId },
      data: {
        [field]: result,
        verificationLog: [...log, ...entry],
      } as Record<string, unknown>,
    });
  }

  /**
   * Force-re-run a single ID check for a subject and overwrite its result.
   * Used by the "Recall API" button. Crime and credit are excluded (they're
   * async/vendor-polled and candidate-address-gated). Aadhaar is re-fetched
   * from the candidate's existing DigiLocker session.
   */
  async recheck(
    subjectId: string,
    type: 'pan' | 'aadhaar' | 'voter' | 'passport' | 'dl' | 'employment',
  ): Promise<Subject> {
    const s = await this.prisma.subject.findUnique({ where: { id: subjectId } });
    if (!s) throw new NotFoundException('Subject not found');

    // Guard the inputs (throws → the recall UI shows the reason), then build
    // the vendor call. Keeping the guard separate means a genuine vendor
    // failure below is stored as a check result, while a missing-input guard
    // isn't.
    let field: string;
    let run: () => Promise<unknown>;
    switch (type) {
      case 'pan':
        if (!s.panNumber)
          throw new BadRequestException('No PAN number on file');
        field = 'panResult';
        run = () => this.verify.pan(s.panNumber!.toUpperCase());
        break;
      case 'voter':
        if (!s.voterId) throw new BadRequestException('No Voter ID on file');
        field = 'voterResult';
        run = () => this.verify.voterId(s.voterId!.toUpperCase());
        break;
      case 'passport':
        if (!s.passportFileNo || !s.dob)
          throw new BadRequestException('Passport needs file number and DOB');
        field = 'passportResult';
        run = () => this.verify.passport(s.passportFileNo!.toUpperCase(), s.dob!);
        break;
      case 'dl':
        if (!s.drivingLicense || !s.dob)
          throw new BadRequestException('Driving licence needs number and DOB');
        field = 'dlResult';
        run = () =>
          this.verify.drivingLicense(s.drivingLicense!.toUpperCase(), s.dob!);
        break;
      case 'aadhaar':
        if (!s.digilockerClientId)
          throw new BadRequestException(
            'Aadhaar needs the candidate to complete DigiLocker first',
          );
        field = 'aadhaarResult';
        run = () => this.verify.digilockerAadhaar(s.digilockerClientId!);
        break;
      case 'employment':
        if (!s.uan) throw new BadRequestException('No UAN on file');
        field = 'employmentResult';
        run = () => this.verify.employmentHistory(s.uan!);
        break;
      default:
        throw new BadRequestException('Unknown check type');
    }

    try {
      const result = await run();
      // Logs the call so this recall is counted in the per-client API cost.
      return await this.storeResult(subjectId, field, result);
    } catch (e) {
      // Genuine 4xx outcome (invalid / not found) → store it so the card shows
      // the exact vendor message. Transient 5xx/network → rethrow to retry.
      if (e instanceof BadRequestException) {
        return this.storeError(subjectId, field, extractError(e));
      }
      throw e;
    }
  }

  /** Pull the first case_id from a KonnectNxt BGV submit envelope. */
  private firstCaseId(resp: Record<string, unknown>): string | null {
    const data = (resp?.data as Record<string, unknown> | undefined) ?? resp;
    const cases =
      (data?.cases_created as Array<Record<string, unknown>> | undefined) ??
      (resp?.cases_created as Array<Record<string, unknown>> | undefined);
    const first = Array.isArray(cases) ? cases[0] : undefined;
    const caseId = first?.case_id;
    return typeof caseId === 'string' ? caseId : null;
  }

  /** Poll the credit report until the signed PDF is ready, then store it. */
  private pollCredit(subjectId: string, caseId: string, attempt: number): void {
    if (attempt > 40) {
      this.logger.warn(`Credit poll gave up for ${subjectId} (${caseId})`);
      return;
    }
    setTimeout(() => {
      void (async () => {
        try {
          const report = (await this.verify.creditCheckReport(
            caseId,
          )) as Record<string, unknown>;
          const data = report?.data;
          if (data) {
            await this.prisma.subject.update({
              where: { id: subjectId },
              data: { creditResult: { data } } as Record<string, unknown>,
            });
            this.logger.log(`Credit report stored for ${subjectId}`);
          } else {
            this.pollCredit(subjectId, caseId, attempt + 1);
          }
        } catch {
          this.pollCredit(subjectId, caseId, attempt + 1);
        }
      })();
    }, 8000);
  }
}
