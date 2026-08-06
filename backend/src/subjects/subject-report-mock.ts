/**
 * Fully-populated fixtures for previewing the candidate report in each state,
 * without needing a real candidate. Fed to renderSubjectReportHtml() by the
 * `GET /subjects/report/mock/:variant` preview endpoint.
 *
 *   success → every check completed with clean, matching data
 *   pending → inputs provided, several checks still awaiting a vendor result
 *   failed  → genuine failed lookups (invalid / not found) across the board
 */
import type { ReportSubject } from './subject-report-html';

export type MockVariant = 'success' | 'pending' | 'failed';

export const MOCK_VARIANTS: MockVariant[] = ['success', 'pending', 'failed'];

/** Shared candidate identity + all inputs provided (so nothing reads "Not provided"). */
function baseSubject(now: Date, hoursAgo: number): ReportSubject {
  const created = new Date(now.getTime() - hoursAgo * 3600 * 1000);
  return {
    id: 'mock000000000000',
    name: 'Rohan Mehta',
    role: 'Lead Product Designer',
    email: 'rohan.mehta@example.com',
    phone: '+91 99887 66554',
    clientName: 'Northwind Labs Pvt Ltd',
    dob: '22-11-1991',
    permanentAddress: '18 Turner Road, Bandra West, Mumbai, Maharashtra 400050',
    panNumber: 'AQRPM8391K',
    aadhaarNumber: '456789012345',
    drivingLicense: 'MH0220190004567',
    voterId: 'ABC1234567',
    passportFileNo: 'MH1079862',
    uan: '100987654321',
    digilockerClientId: 'dl_mock_client',
    crimeRequestId: '7781234',
    createdAt: created,
    updatedAt: now,
    // per-variant result fields are filled in below
    panResult: null,
    aadhaarResult: null,
    dlResult: null,
    voterResult: null,
    passportResult: null,
    employmentResult: null,
    crimeResult: null,
    creditResult: null,
  };
}

export function mockReportSubject(variant: MockVariant): ReportSubject {
  const now = new Date();

  if (variant === 'success') {
    const s = baseSubject(now, 27); // 1d 3h TAT
    s.caseRef = 'ASR-202608-000101';
    s.amountPaid = 899;
    s.aadhaarResult = {
      name: 'Rohan Mehta',
      uidMasked: 'XXXX XXXX 2345',
      dob: '22-11-1991',
      gender: 'M',
      address: {
        house: '18 Turner Road',
        locality: 'Bandra West',
        vtc: 'Mumbai',
        district: 'Mumbai Suburban',
        state: 'Maharashtra',
        pincode: '400050',
        country: 'India',
      },
    };
    s.panResult = {
      pan_number: 'AQRPM8391K',
      full_name: 'Rohan Mehta',
      dob: '22-11-1991',
      gender: 'M',
      email: 'rohan.mehta@example.com',
      phone_number: '9988766554',
    };
    s.dlResult = {
      data: {
        license_number: 'MH0220190004567',
        name: 'Rohan Mehta',
        dob: '22-11-1991',
        state: 'Maharashtra',
        date_of_issue: '2019-06-14',
        date_of_expiry: '2039-06-13',
        vehicle_classes: 'LMV, MCWG',
      },
    };
    s.voterResult = {
      data: {
        epic_no: 'ABC1234567',
        name: 'Rohan Mehta',
        state: 'Maharashtra',
        assembly_constituency: 'Bandra West',
        relation_name: 'Suresh Mehta',
      },
    };
    s.passportResult = {
      data: {
        file_number: 'MH1079862',
        name: 'Rohan Mehta',
        dob: '22-11-1991',
        application_date: '2021-02-08',
        status: 'Passport dispatched',
      },
    };
    s.employmentResult = {
      data: {
        uan: '100987654321',
        member_name: 'Rohan Mehta',
        establishment_name: 'Northwind Labs Pvt Ltd',
        date_of_joining: '2020-01-06',
        last_month: '072026',
      },
    };
    s.crimeResult = {
      data: {
        risk_assessment: {
          risk_type: 'No Risk',
          risk_summary:
            'No criminal, civil or FIR records found matching the candidate across the searched courts and databases.',
          number_of_cases: 0,
        },
        cases: [],
        download_link: 'https://reports.assurio.example/crime/ASR-202608-000101.pdf',
      },
    };
    s.creditResult = {
      data: {
        credit_score: 792,
        bureau: 'CIBIL',
        score_band: 'Excellent',
        total_accounts: 6,
        active_accounts: 3,
        overdue_amount: 0,
        pdf_url: 'https://reports.assurio.example/credit/ASR-202608-000101.pdf',
      },
    };
    return s;
  }

  if (variant === 'pending') {
    const s = baseSubject(now, 2); // 2h in, still processing
    s.caseRef = 'ASR-202608-000102';
    s.amountPaid = 899;
    // Two checks already back…
    s.aadhaarResult = {
      name: 'Rohan Mehta',
      uidMasked: 'XXXX XXXX 2345',
      dob: '22-11-1991',
      gender: 'M',
      address: {
        house: '18 Turner Road',
        locality: 'Bandra West',
        vtc: 'Mumbai',
        state: 'Maharashtra',
        pincode: '400050',
      },
    };
    s.panResult = {
      pan_number: 'AQRPM8391K',
      full_name: 'Rohan Mehta',
      dob: '22-11-1991',
      gender: 'M',
    };
    // …the rest awaiting the vendor (inputs present ⇒ "Pending", not "Not provided").
    s.dlResult = null;
    s.voterResult = null;
    s.passportResult = null;
    s.employmentResult = null;
    s.crimeResult = null; // crimeRequestId set ⇒ in-progress
    s.creditResult = null;
    return s;
  }

  // failed
  const s = baseSubject(now, 20);
  s.caseRef = 'ASR-202608-000103';
  s.amountPaid = 899;
  s.aadhaarResult = {
    __checkError: 'DigiLocker consent was declined — Aadhaar could not be verified.',
  };
  s.panResult = { __checkError: 'This PAN is invalid or does not exist.' };
  s.dlResult = {
    __checkError: 'No driving licence found for the given number and date of birth.',
  };
  s.voterResult = { __checkError: 'Voter ID (EPIC) not found in the electoral roll.' };
  s.passportResult = {
    __checkError: 'Passport file number does not match any active application.',
  };
  s.employmentResult = {
    __checkError: 'No employment history found for the provided UAN.',
  };
  // Crime came back clean; credit still pending — a realistic mixed failure report.
  s.crimeResult = {
    data: {
      risk_assessment: {
        risk_type: 'No Risk',
        risk_summary: 'No records found matching the candidate.',
        number_of_cases: 0,
      },
      cases: [],
      download_link: 'https://reports.assurio.example/crime/ASR-202608-000103.pdf',
    },
  };
  s.creditResult = null;
  return s;
}
