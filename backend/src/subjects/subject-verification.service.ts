import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, Subject } from '../../generated/prisma/client';
import { PrismaService } from '../common/prisma.service';
import { VerifyService } from '../verify/verify.service';
import { ReportGenerationService } from './report-generation.service';
import { S3Service } from '../common/s3.service';
import { WhatsAppService } from '../common/whatsapp.service';
import { EventsService } from '../common/events.service';
import { reportReadyText, type CrimeRisk } from '../common/whatsapp-templates';
import {
  checkApplicability,
  computeSubjectProgress,
} from './subject-progress';
import {
  CREDIT_CHECK_ENABLED,
  PASSPORT_CHECK_ENABLED,
} from '../common/feature-flags';
import {
  aadhaarAddressOf,
  aadhaarKycOf,
  buildBgvAddress,
  coerceToIsoDate,
  formatAddressLine,
  isCompleteStructuredAddress,
  normalizePhone,
  resolveFatherName,
  type AadhaarAddressLike,
} from './bgv-address';

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
/**
 * True while DigiLocker is still expected to deliver the KYC: the candidate has
 * an Aadhaar path (a number entered, or a DigiLocker session opened) but no
 * usable result stored yet. Credit and crime wait for it rather than calling a
 * vendor with incomplete data — no credit spent, no failure recorded.
 */
function aadhaarPending(s: Subject): boolean {
  // Any stored result settles it — a failed DigiLocker ({ __checkError }) is
  // never going to supply an address, so stop deferring and let the check be
  // skipped instead of waiting forever.
  if (s.aadhaarResult) return false;
  return Boolean(s.aadhaarNumber || s.digilockerClientId);
}

/** Date of birth as given by the client, else from the verified Aadhaar. */
function resolveDob(s: Subject): string {
  const typed = (s.dob || '').trim();
  if (typed) return typed;
  return (aadhaarKycOf(s.aadhaarResult)?.dob || '').trim();
}

@Injectable()
export class SubjectVerificationService {
  private readonly logger = new Logger(SubjectVerificationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly verify: VerifyService,
    private readonly reportGen: ReportGenerationService,
    private readonly s3: S3Service,
    private readonly whatsapp: WhatsAppService,
    private readonly events: EventsService,
  ) {}

  /**
   * The checks that WILL run for this subject once consent is granted —
   * derived from the same field conditions as run() below, so the consent
   * page's "what will be verified" list can never drift from the engine.
   */
  plannedChecks(s: Subject): Array<{ key: string; label: string }> {
    // Derived from the one applicability source, so the consent page can never
    // promise a check the engine won't run — e.g. court records with no address
    // and no Aadhaar to supply one.
    return checkApplicability(s)
      .filter((c) => c.applicable)
      .map((c) => ({ key: c.key, label: c.label }));
  }

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
    const s = await this.prisma.subject.findUnique({
      where: { id: subjectId },
    });
    if (!s) return;

    // Hard gate, independent of the caller: vendor APIs cost real money and
    // must never be hit while the wallet hold is still refundable (PENDING) or
    // after it was refunded (DECLINED/EXPIRED). Only GRANTED may spend.
    if (s.consentStatus !== 'GRANTED') {
      this.logger.warn(
        `auto-checks skipped for subject ${s.id}: consent is ${s.consentStatus}`,
      );
      return;
    }

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
      PASSPORT_CHECK_ENABLED && Boolean(s.passportFileNo && s.dob) && !s.passportResult,
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

    // ── Credit — needs PAN + DOB + a COMPLETE structured address. The bureau
    //    rejects anything less, so we build the address from the candidate's
    //    verified Aadhaar and defer entirely when it isn't there yet: no
    //    vendor credit spent, no failure recorded. It re-fires automatically
    //    once DigiLocker completes (see runForSubject on Aadhaar store). ──
    if (CREDIT_CHECK_ENABLED && s.panNumber && !s.creditRequestId && !s.creditResult) {
      const address = buildBgvAddress(
        aadhaarAddressOf(s.aadhaarResult),
        s.permanentAddress || '',
      );
      // The bureau also rejects the submission without a father's name
      // ("Fathers name is required for credit_report_check"), so gate on it
      // too rather than spending a credit on a guaranteed rejection. Taken
      // from Aadhaar first, then PAN, then the form (resolveFatherName).
      const fatherName = resolveFatherName(s) ?? '';
      // The bureau also demands a contact number
      // ("phone is required for credit_report_check").
      const phone = normalizePhone(s.phone || '');
      // DOB from the form, else from the verified Aadhaar.
      const dob = resolveDob(s);
      // Everything the bureau demands that the client may have left blank —
      // Aadhaar supplies all of these except the phone.
      const hasAddress = isCompleteStructuredAddress(address);
      const missing = [
        !hasAddress ? 'address' : '',
        !dob ? 'date of birth' : '',
        !fatherName ? "father's name" : '',
        !phone ? 'phone number' : '',
      ].filter(Boolean);

      if (!hasAddress || missing.length > 0) {
        // Don't spend a vendor credit on a submission that will be rejected.
        // While DigiLocker is still expected, wait for it — it re-runs this
        // engine when it lands.
        this.logger.log(
          aadhaarPending(s)
            ? `Credit check deferred for ${s.id}: waiting on verified Aadhaar for ${missing.join(', ')}`
            : `Credit check skipped for ${s.id}: the bureau requires ${missing.join(', ')}`,
        );
      } else {
        try {
          const resp = (await this.verify.creditCheck({
            name: s.name,
            fatherName,
            // The bureau requires ISO dates; our form stores DD-MM-YYYY.
            dob: coerceToIsoDate(dob) ?? dob,
            phone,
            email: s.email || undefined,
            panNumber: s.panNumber.toUpperCase(),
            street: address.street,
            city: address.city,
            state: address.state,
            pincode: address.pincode,
            country: address.country,
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
          const msg = extractError(e);
          this.logger.warn(`Credit check failed for ${s.id}: ${msg}`);
          // Record the failure so the check is terminal. Without this it stays
          // neither done nor failed and the verification can never reach 100%,
          // stranding the report. Recall API re-runs it; an admin can also pass
          // it manually.
          await this.storeResult(s.id, 'creditResult', { __checkError: msg });
        }
      }
    }

    // ── Crime — needs name + DOB + address. Async: initiate, then poll.
    //    The vendor takes a free-text address: use the one the client typed,
    //    and when they left it blank fall back to the verified Aadhaar address
    //    (flattened to a single line). Like credit, it then defers until
    //    DigiLocker completes and re-fires from runForSubject. ──
    if (s.name && !s.crimeRequestId && !s.crimeResult) {
      // Court records are searched on the PERMANENT address, which crime-check
      // takes as one free-text line. Build it through the same structured
      // helper the credit bureau uses so both read the identical address, then
      // flatten — a partial address still submits here.
      const crimeStructured =
        buildBgvAddress(
          aadhaarAddressOf(s.aadhaarResult),
          s.permanentAddress || '',
          'Permanent',
        ) ?? null;
      const crimeAddress = formatAddressLine(crimeStructured);
      const crimeDob = resolveDob(s);
      const crimeFatherName = resolveFatherName(s) ?? '';
      const crimeMissing = [
        !crimeAddress ? 'address' : '',
        !crimeDob ? 'date of birth' : '',
        !crimeFatherName ? "father's name" : '',
      ].filter(Boolean);

      if (crimeMissing.length > 0) {
        this.logger.log(
          aadhaarPending(s)
            ? `Crime check deferred for ${s.id}: waiting on verified Aadhaar for ${crimeMissing.join(', ')}`
            : `Crime check skipped for ${s.id}: missing ${crimeMissing.join(', ')}`,
        );
      } else {
        try {
          const resp = (await this.verify.crimeCheck({
            name: s.name,
            fatherName: crimeFatherName,
            // verify.service normalises whichever date shape we hand it, so
            // pass the stored value through untouched.
            dob: crimeDob,
            panNumber: s.panNumber || undefined,
            address: crimeAddress,
          })) as Record<string, unknown>;
          // The submit never returns a verdict — only the case to poll.
          const requestId = this.firstCaseId(resp);
          if (requestId) {
            await this.prisma.subject.update({
              where: { id: s.id },
              data: {
                crimeRequestId: String(requestId),
                crimeRequestedAt: new Date(),
              },
            });
            this.pollCrime(s.id, String(requestId), 0);
            this.logger.log(`Crime check initiated for ${s.id} (${requestId})`);
          }
        } catch (e) {
          const msg = extractError(e);
          this.logger.warn(`Crime check failed for ${s.id}: ${msg}`);
          // Terminal, for the same reason as credit above.
          await this.storeResult(s.id, 'crimeResult', { __checkError: msg });
        }
      }
    }

    // Catch init-only status changes (crime/credit request queued) so the PDF
    // reflects "pending" too; sync results already scheduled via storeResult.
    this.reportGen.scheduleRegen(subjectId);

    // Re-evaluate completion at the end of every run, not only when a result
    // lands. The condition can become true without any new result — a check
    // being switched off (credit), an operator resolving a failure, or a check
    // dropping out of scope once Aadhaar settles all reduce the applicable
    // total. Without this the report could sit finished-but-unsent forever.
    const fresh = await this.prisma.subject.findUnique({
      where: { id: subjectId },
    });
    if (fresh) await this.completeIfDone(fresh);
  }

  /**
   * Polls one crime check by case_id and stores the report once the vendor has
   * produced it. Returns true when the check reached a terminal state, false
   * while it is still running.
   *
   * The vendor searches court records manually and quotes a 24-48 hour
   * turnaround, so completion is NOT expected within a request lifetime — this
   * is called both by the short in-process poll (which catches the fast cases)
   * and by the durable sweep in CrimePollProcessor, which is what actually
   * finishes most checks. Both funnel through here so the storing rules can
   * never diverge.
   */
  async pollCrimeOnce(subjectId: string, requestId: string): Promise<boolean> {
    // Gate on the status endpoint, NOT on the download. The download returns a
    // signed URL even mid-search, pointing at an empty placeholder PDF — so a
    // URL proves nothing and storing it would publish an unsearched clean
    // sheet as a finished criminal-records report.
    const statusResp = (await this.verify.crimeCheckStatus(requestId)) as
      | Record<string, unknown>
      | undefined;
    const data = statusResp?.data as Record<string, unknown> | undefined;
    if (!data) return false; // 404 / unknown case — keep waiting.

    const criminal = data.criminal_check as Record<string, unknown> | undefined;
    // The per-check status is authoritative; the case-level one is the
    // fallback for a payload that omits it.
    const state = String(criminal?.status ?? data.status ?? '').toLowerCase();
    const reportType = String(data.report_type ?? '').toUpperCase();

    if (/fail|cancel|reject|abort/.test(state)) {
      const msg =
        (typeof criminal?.Description === 'string' && criminal.Description) ||
        `Crime check ${state}`;
      this.logger.warn(`Crime check failed for ${subjectId}: ${msg}`);
      await this.storeResult(subjectId, 'crimeResult', { __checkError: msg });
      return true;
    }

    // `status: Completed` + `report_type: FINAL` is NOT sufficient. A case has
    // been observed reporting both while its own PDF still read "Report Status:
    // In Progress" with no severity and no end date — the search had not run.
    // What separated it from a genuinely finished case was the error pair below
    // (status_code 500 / error_message set) sitting inside criminal_check.
    // Treat that as "not done" rather than "done": the sweep keeps polling and,
    // if it never clears, the 72h expiry hands it to an operator. Publishing a
    // report whose own first page says In Progress is the worse failure.
    const vendorCode = Number(criminal?.status_code ?? 0);
    const vendorError = String(criminal?.error_message ?? '').trim();
    const vendorFaulted =
      vendorCode >= 400 || (vendorError.length > 0 && !/^(none|null|-)$/i.test(vendorError));

    const finished =
      state === 'completed' && (!reportType || reportType === 'FINAL');
    if (!finished) return false;
    if (vendorFaulted) {
      this.logger.warn(
        `Crime case ${requestId} claims Completed but carries ${vendorCode} "${vendorError}" — treating as still running`,
      );
      return false;
    }

    const report = (await this.verify.crimeCheckReport(requestId)) as
      | Record<string, unknown>
      | undefined;
    const url = typeof report?.data === 'string' ? report.data.trim() : '';
    // Complete but no document yet — keep polling rather than storing a
    // result with nothing to show for it.
    if (!/^https?:\/\//i.test(url)) return false;

    // Stored under `data` so vendorReportUrl finds it on both the report PDF
    // and the UI. There is no structured verdict on this pipeline — only the
    // document — and both readouts must say so rather than render "0 cases".
    await this.storeResult(subjectId, 'crimeResult', { data: url });
    this.logger.log(`Crime report stored for ${subjectId} (${requestId})`);
    return true;
  }

  /**
   * Records a crime check as failed once it has outlived the vendor's search
   * window. Stored as an unresolved failure, not a pass: the courts were never
   * actually searched, so the client sees "in progress" while an operator
   * decides whether to re-run it or release it.
   */
  async expireCrimeCheck(subjectId: string): Promise<void> {
    const msg = 'Crime check did not complete within the expected time';
    this.logger.warn(`Crime check expired for ${subjectId}`);
    await this.storeResult(subjectId, 'crimeResult', { __checkError: msg });
  }

  /**
   * Short in-process poll right after initiation — ~8s x 40 ≈ 5 minutes, which
   * only catches checks the vendor happens to answer immediately. Giving up is
   * expected and harmless: crimeRequestId stays set with no crimeResult, and
   * the repeatable sweep picks it up for as long as it takes. Never records a
   * failure on timeout.
   */
  private pollCrime(subjectId: string, requestId: string, attempt: number): void {
    if (attempt > 40) {
      this.logger.log(
        `Crime still pending for ${subjectId} (${requestId}) — handing off to the sweep`,
      );
      return;
    }
    setTimeout(() => {
      void (async () => {
        try {
          if (await this.pollCrimeOnce(subjectId, requestId)) return;
        } catch {
          // Transient vendor/network failure — keep waiting, don't fail the check.
        }
        this.pollCrime(subjectId, requestId, attempt + 1);
      })();
    }, 8000);
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

    // These are synchronous vendor lookups: they must end in a stored result,
    // never sit "In progress" indefinitely. A 4xx is a genuine outcome and is
    // stored immediately. A 5xx / network blip is retried a few times — the
    // vendor is often briefly unavailable — and if it still fails we store it
    // so the check is terminal and lands in the operator queue rather than
    // hanging invisibly forever.
    const MAX_ATTEMPTS = 3;
    const BACKOFF_MS = [2_000, 5_000];

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      try {
        const result = await call();
        await this.storeResult(subjectId, field, result);
        this.logger.log(`${label} check done for ${subjectId}`);
        return;
      } catch (e) {
        const msg = extractError(e);

        // Genuine outcome (invalid / not found) — retrying won't change it.
        if (e instanceof BadRequestException) {
          await this.storeError(subjectId, field, msg);
          this.logger.warn(`${label} check failed for ${subjectId}: ${msg}`);
          return;
        }

        const last = attempt === MAX_ATTEMPTS;
        this.logger.warn(
          `${label} check attempt ${attempt}/${MAX_ATTEMPTS} failed for ${subjectId}: ${msg}`,
        );
        if (last) {
          // Out of retries: record it so the check ends and can be resolved.
          await this.storeError(subjectId, field, msg);
          return;
        }
        await new Promise((r) => setTimeout(r, BACKOFF_MS[attempt - 1]));
      }
    }
  }

  /** Persist a genuine verification failure so the UI can show it. Not billed. */
  private async storeError(
    subjectId: string,
    field: string,
    message: string,
  ): Promise<Subject> {
    const updated = await this.prisma.subject.update({
      where: { id: subjectId },
      data: { [field]: { __checkError: message } } as Record<string, unknown>,
    });
    this.reportGen.scheduleRegen(subjectId);
    return updated;
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
    const entry = type ? [{ type, calledAt: new Date().toISOString() }] : [];
    const updated = await this.prisma.subject.update({
      where: { id: subjectId },
      data: {
        [field]: result,
        verificationLog: [...log, ...entry],
      } as Record<string, unknown>,
    });
    // Push the fresh subject to any open viewer. Without this a result stored
    // outside a request — the crime sweep finishing a day later — never reached
    // the page, which only ever saw the report-regen nudge.
    this.events.emit(this.events.subjectChannel(subjectId), updated);
    this.reportGen.scheduleRegen(subjectId);
    // The criminal-records outcome is the one result the client wants to hear
    // about immediately, not only in the final report.
    if (field === 'crimeResult') void this.notifyCrimeRisk(updated);
    // Every stored result is a chance for the verification to have just become
    // 100% complete — check here so it's covered no matter which path (sync
    // check, DigiLocker, crime/credit poll) delivered the last one.
    void this.completeIfDone(updated);
    return updated;
  }

  /** WhatsApp the client the criminal-records risk band as soon as it lands. */
  private async notifyCrimeRisk(s: Subject): Promise<void> {
    try {
      const result = s.crimeResult as Record<string, unknown> | null;
      if (!result || '__checkError' in result) return;
      const data = result.data as Record<string, unknown> | undefined;
      const ra = data?.risk_assessment as Record<string, unknown> | undefined;
      // crime-check states the band as risk_type: "Low Risk" / "Medium Risk" /
      // "High Risk" / "Very High Risk". "Very High" is folded into high — the
      // alert has no louder setting than that.
      const raw = String(ra?.risk_type ?? '').toUpperCase();
      const risk: CrimeRisk | null = /HIGH/.test(raw)
        ? 'high'
        : /MEDIUM/.test(raw)
          ? 'medium'
          : /LOW/.test(raw)
            ? 'low'
            : null;
      // Only alert when the vendor actually stated a band — never infer "low"
      // from its absence.
      if (!risk) {
        this.logger.log(
          `Crime result for ${s.id} carries no risk band — no risk alert sent`,
        );
        return;
      }

      const client = await this.prisma.user.findUnique({
        where: { id: s.userId },
      });
      if (!client?.phone) return;
      await this.whatsapp.sendCrimeRiskAlert(
        client.phone,
        client.name,
        s.name,
        risk,
      );
    } catch (e) {
      this.logger.warn(
        `Crime risk notify failed for ${s.id}: ${
          e instanceof Error ? e.message : e
        }`,
      );
    }
  }

  /**
   * Marks the verification complete the moment the LAST applicable check lands,
   * then delivers the finished report PDF to the client on WhatsApp.
   *
   * Called after every stored result. Both steps are guarded by conditional
   * updates (`reportCompletedAt: null` / `reportSentAt: null`), so concurrent
   * results racing to finish can only ever produce one completion and one
   * delivery.
   */
  private async completeIfDone(s: Subject): Promise<void> {
    if (s.reportCompletedAt) return;
    const { done, total } = computeSubjectProgress(s);
    if (total === 0 || done < total) return;

    // Claim the completion — only the first caller wins.
    const claimed = await this.prisma.subject.updateMany({
      where: { id: s.id, reportCompletedAt: null },
      data: { reportCompletedAt: new Date(), status: 'completed' },
    });
    if (claimed.count === 0) return;
    this.logger.log(`Verification complete for ${s.id} (${done}/${total} checks)`);

    try {
      // Regenerate synchronously so the PDF we send includes the final result,
      // rather than racing the debounced background regen.
      await this.reportGen.regenerate(s.id);
      await this.deliverReport(s.id);
    } catch (e) {
      this.logger.error(
        `Report delivery failed for ${s.id}: ${
          e instanceof Error ? e.message : e
        }`,
      );
    }
  }

  /** Send the finished report PDF to the client on WhatsApp, exactly once. */
  private async deliverReport(subjectId: string): Promise<void> {
    const doc = await this.prisma.subject.findUnique({
      where: { id: subjectId },
    });
    if (!doc || doc.reportSentAt) return;

    const client = await this.prisma.user.findUnique({
      where: { id: doc.userId },
    });
    const clientPhone = (client?.phone || '').trim();
    if (!clientPhone) {
      this.logger.warn(
        `Report ready for ${subjectId} but client ${doc.userId} has no phone — WhatsApp delivery skipped`,
      );
      return;
    }
    if (!doc.reportPdfS3Key) {
      this.logger.warn(`Report ready for ${subjectId} but no PDF was generated`);
      return;
    }

    // Claim the send before calling out, so a retry can't double-deliver.
    const claimed = await this.prisma.subject.updateMany({
      where: { id: subjectId, reportSentAt: null },
      data: { reportSentAt: new Date() },
    });
    if (claimed.count === 0) return;

    const buffer = await this.s3.getObjectBuffer(doc.reportPdfS3Key);
    const filename = `Assurio-report-${doc.name.replace(/[^A-Za-z0-9]+/g, '-')}.pdf`;
    const caption = reportReadyText(client?.name || 'there', doc.name);

    const ok = await this.whatsapp.sendDocument(
      clientPhone,
      buffer,
      filename,
      caption,
    );
    if (ok) {
      this.logger.log(`Report PDF sent to client ${clientPhone} for ${subjectId}`);
    } else {
      // Release the claim so the next completed check retries the delivery.
      await this.prisma.subject.update({
        where: { id: subjectId },
        data: { reportSentAt: null },
      });
      this.logger.warn(`Report PDF delivery to ${clientPhone} failed for ${subjectId}`);
    }
  }

  /**
   * Admin override — record a check as passed by hand because the vendor API
   * couldn't answer. Deliberately stored as `{ __manualOverride }` rather than a
   * synthetic vendor payload: the report must be able to say this was verified
   * by a person, not by the source. Goes through storeResult so it triggers the
   * same completion/PDF path as a real result.
   */
  async manualPass(
    subjectId: string,
    field: string,
    passedBy: string,
    reason: string,
    resolution: 'passed' | 'unable' = 'passed',
  ): Promise<Subject> {
    const s = await this.prisma.subject.findUnique({ where: { id: subjectId } });
    if (!s) throw new NotFoundException('Candidate not found');

    const previous = (s as unknown as Record<string, unknown>)[field];
    const previousError =
      previous &&
      typeof previous === 'object' &&
      '__checkError' in (previous as object)
        ? String((previous as { __checkError: unknown }).__checkError)
        : null;

    this.logger.warn(
      `Manual resolution (${resolution}): ${field} for ${subjectId} by ${passedBy}${
        reason ? ` — ${reason}` : ''
      }`,
    );

    // 'unable' releases the vendor failure to the client as "Unable to verify"
    // — the check ends unverified. Stamping __resolvedAt is what makes it
    // terminal; until then the client only ever sees the check in progress.
    if (resolution === 'unable') {
      return this.storeResult(subjectId, field, {
        __checkError: previousError ?? 'Verification could not be completed.',
        __resolvedAt: new Date().toISOString(),
        __resolvedBy: passedBy,
        reason: reason || null,
      });
    }

    return this.storeResult(subjectId, field, {
      __manualOverride: true,
      passedBy,
      passedAt: new Date().toISOString(),
      reason: reason || null,
      // Keep what the vendor actually said, so the override stays auditable.
      replacedError: previousError,
    });
  }

  /**
   * Submit the crime check with an operator-supplied payload, bypassing the
   * derivation in run().
   *
   * run() builds the vendor body from the candidate's stored fields and skips
   * entirely when DOB, address or father's name are absent — correct for the
   * automatic path, useless when an admin has the details in hand (from an ID
   * scan, a phone call, a KYC that never completed) and just wants the search
   * run. This takes the fields as given and submits them.
   *
   * It still stores the request_id against the subject and starts the poll, so
   * the result lands on the report exactly like an automatic submission — this
   * is a different way in, not a side channel.
   */
  async submitCrimeManually(
    subjectId: string,
    payload: {
      name: string;
      fatherName?: string;
      dob?: string;
      address?: string;
      panNumber?: string;
    },
  ): Promise<Subject> {
    const s = await this.prisma.subject.findUnique({
      where: { id: subjectId },
    });
    if (!s) throw new NotFoundException('Subject not found');

    // Same money gate as every other path — an operator-entered payload is
    // still vendor spend, and consent governs spend.
    if (s.consentStatus !== 'GRANTED') {
      throw new BadRequestException(
        s.consentStatus === 'PENDING'
          ? 'Awaiting candidate consent — checks are locked until they agree.'
          : 'Consent was declined or expired — this verification is closed.',
      );
    }
    if (s.crimeRequestId && !s.crimeResult) {
      throw new BadRequestException(
        'A crime check is already in progress for this candidate.',
      );
    }

    try {
      const resp = (await this.verify.crimeCheck(payload)) as Record<
        string,
        unknown
      >;
      const requestId = this.firstCaseId(resp);
      if (!requestId) {
        throw new BadRequestException(
          'The source accepted the request but created no case.',
        );
      }
      const updated = await this.prisma.subject.update({
        where: { id: subjectId },
        data: {
          crimeResult: Prisma.DbNull,
          crimeRequestId: String(requestId),
          crimeRequestedAt: new Date(),
        },
      });
      this.pollCrime(subjectId, String(requestId), 0);
      this.logger.log(
        `Crime check submitted manually for ${subjectId} (${requestId})`,
      );
      this.events.emit(this.events.subjectChannel(subjectId), updated);
      this.reportGen.scheduleRegen(subjectId);
      return updated;
    } catch (e) {
      // Surfaced to the operator who pressed the button rather than stored as
      // the candidate's failure — they can correct the payload and retry.
      throw new BadRequestException(extractError(e));
    }
  }

  /**
   * Force-re-run a single ID check for a subject and overwrite its result.
   * Used by the "Recall API" button. Crime and credit are excluded (they're
   * async/vendor-polled and candidate-address-gated). Aadhaar is re-fetched
   * from the candidate's existing DigiLocker session.
   */
  async recheck(
    subjectId: string,
    type:
      | 'pan'
      | 'aadhaar'
      | 'voter'
      | 'passport'
      | 'dl'
      | 'employment'
      | 'crime'
      | 'credit',
  ): Promise<Subject> {
    const s = await this.prisma.subject.findUnique({
      where: { id: subjectId },
    });
    if (!s) throw new NotFoundException('Subject not found');

    // Same money gate as the auto-run: no vendor spend unless consent GRANTED.
    if (s.consentStatus !== 'GRANTED') {
      throw new BadRequestException(
        s.consentStatus === 'PENDING'
          ? 'Awaiting candidate consent — checks are locked until they agree.'
          : 'Consent was declined or expired — this verification is closed.',
      );
    }

    // Crime and credit are async: the vendor takes a submission and we poll for
    // the report. "Recall" therefore means clear the stored result + case id and
    // let the engine re-submit — it can't just re-run a synchronous call.
    // NB: a re-submit bills the vendor again (~100 credits for criminal).
    if (type === 'crime' || type === 'credit') {
      await this.prisma.subject.update({
        where: { id: subjectId },
        data:
          type === 'crime'
            ? // crimeRequestedAt must go too: the sweep ages a pending check
              // off that stamp, so a stale one would expire the fresh
              // submission on its first tick.
              {
                crimeResult: Prisma.DbNull,
                crimeRequestId: null,
                crimeRequestedAt: null,
              }
            : { creditResult: Prisma.DbNull, creditRequestId: null },
      });
      this.logger.log(`Recall: re-submitting ${type} for ${subjectId}`);
      await this.run(subjectId);
      const updated = await this.prisma.subject.findUnique({
        where: { id: subjectId },
      });
      if (!updated) throw new NotFoundException('Subject not found');
      return updated;
    }

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
        run = () =>
          this.verify.passport(s.passportFileNo!.toUpperCase(), s.dob!);
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
            this.reportGen.scheduleRegen(subjectId);
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
