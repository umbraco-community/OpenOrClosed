import { UmbModalToken } from '@umbraco-cms/backoffice/modal';
import type { HoursRange } from '../timeline/time-range.js';
import type { Holiday } from './holiday.js';

export interface OocHolidayModalData {
    /** The holiday being edited. A new one arrives already defaulted to today. */
    holiday: Holiday;
    /** Shown as a hint when the mode is Default, so the editor can see what it resolves to. */
    defaultHours: HoursRange[];
    use24Hour: boolean;
    showAppointmentOnly: boolean;
}

export interface OocHolidayModalValue {
    /** Null means the editor asked to remove this holiday. */
    holiday: Holiday | null;
}

export const OOC_HOLIDAY_MODAL = new UmbModalToken<OocHolidayModalData, OocHolidayModalValue>(
    'OpenOrClosed.Modal.Holiday',
    {
        modal: {
            type: 'sidebar',
            size: 'small',
        },
    },
);
