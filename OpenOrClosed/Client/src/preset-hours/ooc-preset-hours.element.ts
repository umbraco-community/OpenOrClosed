import { css, customElement, html, property } from '@umbraco-cms/backoffice/external/lit';
import { UmbLitElement } from '@umbraco-cms/backoffice/lit-element';
import { UmbChangeEvent } from '@umbraco-cms/backoffice/event';
import { umbOpenModal } from '@umbraco-cms/backoffice/modal';
import type {
    UmbPropertyEditorConfigCollection,
    UmbPropertyEditorUiElement,
} from '@umbraco-cms/backoffice/property-editor';
import { sanitizeRanges, type HoursRange } from '../timeline/time-range.js';
import { OOC_RANGE_MODAL } from '../timeline/range-modal.token.js';
import '../timeline/ooc-time-axis.element.js';
import '../timeline/ooc-timeline.element.js';

/**
 * Edits the Preset Hours data type setting: one 24-hour track of blocks that the editors then lay
 * onto an empty day in a single click.
 *
 * A settings editor cannot see the *values* of the settings beside it, so neither `time_24hr` nor
 * `showAppointmentOnly` is readable here. It therefore always shows 24-hour times - an admin
 * surface configured once, which is a smaller cost than the machinery to read a sibling value - and
 * always offers the appointment flag. The consumers strip that flag as they read the setting, so a
 * flag a content editor cannot see is never written into a document.
 *
 * No preset is passed to its own timeline: a preset editor ghosting itself would be circular, and
 * clicking an empty track to add one block is the right way to build a preset from nothing.
 */
@customElement('ooc-preset-hours')
export class OocPresetHoursElement extends UmbLitElement implements UmbPropertyEditorUiElement {
    @property({ type: Array })
    value: HoursRange[] = [];

    @property({ attribute: false })
    config?: UmbPropertyEditorConfigCollection;

    private get _ranges(): HoursRange[] {
        return sanitizeRanges(this.value);
    }

    private _setRanges(ranges: HoursRange[]) {
        this.value = ranges;
        this.dispatchEvent(new UmbChangeEvent());
    }

    private async _editRange(index: number) {
        try {
            const result = await umbOpenModal(this, OOC_RANGE_MODAL, {
                data: { ranges: this._ranges, index, showAppointmentOnly: true },
            });

            this._setRanges(result.ranges);
        } catch {
            // Dismissed - leave the preset as it was.
        }
    }

    static styles = css`
        :host {
            display: block;
        }
    `;

    render() {
        const label = this.localize.term('openOrClosed_presetHoursLabel');

        return html`
            <ooc-time-axis></ooc-time-axis>
            <ooc-timeline
                .ranges=${this._ranges}
                .showAppointmentOnly=${true}
                .trackLabel=${label}
                @change=${(e: CustomEvent) => this._setRanges(e.detail.ranges)}
                @edit-range=${(e: CustomEvent) => this._editRange(e.detail.index)}>
            </ooc-timeline>
        `;
    }
}

export default OocPresetHoursElement;

declare global {
    interface HTMLElementTagNameMap {
        'ooc-preset-hours': OocPresetHoursElement;
    }
}
