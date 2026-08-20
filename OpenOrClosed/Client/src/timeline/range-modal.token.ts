import { UmbModalToken } from '@umbraco-cms/backoffice/modal';
import type { HoursRange } from './time-range.js';

export interface OocRangeModalData {
    /** Every range on the day, so the modal can validate against its neighbours. */
    ranges: HoursRange[];
    index: number;
    showAppointmentOnly: boolean;
    // Deliberately no use24Hour: the times are entered through a native <input type="time">,
    // whose 12/24-hour presentation follows the operating system, not our setting.
}

export interface OocRangeModalValue {
    /** The whole day after editing - a removal simply comes back one range shorter. */
    ranges: HoursRange[];
}

export const OOC_RANGE_MODAL = new UmbModalToken<OocRangeModalData, OocRangeModalValue>(
    'OpenOrClosed.Modal.Range',
    {
        modal: {
            type: 'sidebar',
            size: 'small',
        },
    },
);
