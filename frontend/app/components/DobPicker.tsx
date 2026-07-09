'use client';

import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs';
import dayjs, { type Dayjs } from 'dayjs';
import customParseFormat from 'dayjs/plugin/customParseFormat';

dayjs.extend(customParseFormat);

interface DobPickerProps {
  value: string;        // DD-MM-YYYY or ''
  onChange: (v: string) => void;
  label?: string;
}

const POPUP_SX = {
  background: 'var(--card)',
  border: '1.5px solid var(--rule)',
  borderRadius: '12px',
  boxShadow: '0 4px 28px rgba(26,22,18,0.13)',
  fontFamily: 'inherit',

  '& .MuiDayCalendar-weekDayLabel': {
    color: 'var(--ink-2)',
    fontSize: '11px',
    fontWeight: 600,
    fontFamily: 'inherit',
  },

  '& .MuiPickerDay-root': {
    color: 'var(--ink)',
    background: 'transparent',
    fontFamily: 'inherit',
    fontSize: '12.5px',
    fontWeight: 500,
    borderRadius: '8px',
    '&:hover': { background: 'var(--paper-2)' },
    '&.Mui-selected': {
      background: 'var(--ok)',
      color: 'var(--card)',
      fontWeight: 700,
      '&:hover': { background: '#26553b' },
      '&:focus': { background: 'var(--ok)' },
    },
    '&.MuiPickerDay-today:not(.Mui-selected)': {
      border: '1.5px solid var(--ok)',
      color: 'var(--ok)',
      background: 'transparent',
      '&:hover': { background: 'var(--paper-2)' },
    },
    '&.Mui-disabled': { color: 'var(--ink-3)' },
  },

  '& .MuiPickersCalendarHeader-label': {
    color: 'var(--ink)',
    fontFamily: 'inherit',
    fontWeight: 700,
    fontSize: '13px',
  },

  '& .MuiPickersArrowSwitcher-button, & .MuiPickersCalendarHeader-switchViewButton': {
    color: 'var(--ink-2)',
    '&:hover': { background: 'var(--paper-2)' },
  },

  '& .MuiPickersYear-yearButton': {
    color: 'var(--ink)',
    fontFamily: 'inherit',
    fontSize: '13px',
    borderRadius: '8px',
    '&:hover': { background: 'var(--paper-2)' },
    '&.Mui-selected': { background: 'var(--ok)', color: 'var(--card)', '&:hover': { background: '#26553b' } },
  },
  '& .MuiPickersMonth-monthButton': {
    color: 'var(--ink)',
    fontFamily: 'inherit',
    fontSize: '13px',
    borderRadius: '8px',
    '&:hover': { background: 'var(--paper-2)' },
    '&.Mui-selected': { background: 'var(--ok)', color: 'var(--card)', '&:hover': { background: '#26553b' } },
  },
};

export default function DobPicker({ value, onChange, label = 'Date of birth' }: DobPickerProps) {
  const parsed = value ? dayjs(value, 'DD-MM-YYYY', true) : null;
  const dayjsValue = parsed?.isValid() ? parsed : null;

  function handleChange(d: Dayjs | null) {
    onChange(d?.isValid() ? d.format('DD-MM-YYYY') : '');
  }

  return (
    <div className="ac-field">
      <label className="ac-field-label">{label}</label>

      {/* Outer wrapper styled exactly like .ac-input */}
      <div
        className={`ac-input${dayjsValue ? ' is-valid' : ''}`}
        style={{ padding: 0, overflow: 'hidden' }}
      >
        <LocalizationProvider dateAdapter={AdapterDayjs}>
          <DatePicker
            value={dayjsValue}
            onChange={handleChange}
            format="DD/MM/YYYY"
            disableFuture
            slotProps={{
              textField: {
                fullWidth: true,
                sx: {
                  height: '100%',
                  '& .MuiPickersTextField-root, & .MuiFormControl-root': { height: '100%' },

                  /* Remove all MUI border / background — ac-input handles it */
                  '& .MuiPickersOutlinedInput-root': {
                    height: '100%',
                    background: 'transparent',
                    borderRadius: 0,
                    paddingLeft: '14px',
                    paddingRight: '8px',
                    fontFamily: 'inherit',
                    '& fieldset': { border: 'none' },
                    '&:hover fieldset': { border: 'none' },
                    '&.Mui-focused fieldset': { border: 'none' },
                  },

                  /* Section list (day/month/year segments) */
                  '& .MuiPickersSectionList-root': {
                    padding: 0,
                    fontFamily: 'inherit',
                    fontSize: '14.5px',
                    fontWeight: 500,
                    color: 'var(--ink)',
                    letterSpacing: '0.01em',
                  },
                  '& .MuiPickersSectionList-sectionContent': {
                    fontFamily: 'inherit',
                    fontSize: '14.5px',
                    fontWeight: 500,
                    color: 'var(--ink)',
                  },
                  '& .MuiPickersInputBase-sectionBefore, & .MuiPickersInputBase-sectionAfter': {
                    color: 'var(--ink-3)',
                    fontFamily: 'inherit',
                    fontSize: '14.5px',
                  },

                  /* Calendar icon button */
                  '& .MuiIconButton-root': {
                    color: 'var(--ink-3)',
                    padding: '6px',
                    '&:hover': { background: 'var(--paper-2)', color: 'var(--ink)' },
                  },

                  /* Label — hidden; we render our own above */
                  '& .MuiInputLabel-root, & .MuiFormLabel-root': { display: 'none' },
                  '& legend': { display: 'none' },
                },
              },
              desktopPaper: { sx: POPUP_SX },
              mobilePaper:  { sx: POPUP_SX },
            }}
          />
        </LocalizationProvider>
      </div>
    </div>
  );
}
