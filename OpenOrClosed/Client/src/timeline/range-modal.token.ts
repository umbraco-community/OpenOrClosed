import { UmbModalToken } from '@umbraco-cms/backoffice/modal';
import type { HoursRange } from './time-range.js';

export interface OocRangeModalData {
    /** Every range on the day, so the modal can validate against its neighbours. */
    ranges: HoursRange[];
    index: number;
    use24Hour: boolean;
    showAppointmentOnly: boolean;
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
