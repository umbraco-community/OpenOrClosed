import { UmbModalToken } from '@umbraco-cms/backoffice/modal';

export interface OocCopyTarget {
    /** Opaque to the modal - the caller resolves it back to a day number or a holiday position. */
    id: string;
    label: string;
    /** Renders a "will be replaced" note. Nothing else acts on it. */
    occupied: boolean;
}

export interface OocCopyTargetGroup {
    label: string;
    ids: string[];
}

export interface OocCopyTargetsModalData {
    /** Named in the headline, e.g. "Monday". */
    sourceLabel: string;
    targets: OocCopyTarget[];
    /**
     * Quick selections such as Weekdays. Additive rather than modes: a group ticks its own boxes and
     * leaves the rest of the selection alone, so they compose with ticking by hand.
     */
    groups?: OocCopyTargetGroup[];
}

export interface OocCopyTargetsModalValue {
    ids: string[];
}

export const OOC_COPY_TARGETS_MODAL = new UmbModalToken<
    OocCopyTargetsModalData,
    OocCopyTargetsModalValue
>('OpenOrClosed.Modal.CopyTargets', {
    modal: {
        type: 'sidebar',
        size: 'small',
    },
});
