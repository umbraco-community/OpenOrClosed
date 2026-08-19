import { css, customElement, html, state } from '@umbraco-cms/backoffice/external/lit';
import { UmbModalBaseElement } from '@umbraco-cms/backoffice/modal';
import { DAY_MINUTES, formatTime, parseTime, validateRange } from './time-range.js';
import type { OocRangeModalData, OocRangeModalValue } from './range-modal.token.js';

/**
 * Edits one range precisely, in a sidebar. This is the keyboard route into exact times, and the
 * only place a range can be given a label or marked by appointment only.
 */
@customElement('ooc-range-modal')
export class OocRangeModalElement extends UmbModalBaseElement<OocRangeModalData, OocRangeModalValue> {
    @state() private _start = '09:00';
    @state() private _end = '17:00';
    @state() private _label = '';
    @state() private _byAppointmentOnly = false;
    @state() private _error: string | null = null;

    /** The modal manager sets `data` asynchronously, so seed the fields the first time it arrives. */
    #seeded = false;

    willUpdate(changed: Map<string, unknown>) {
        super.willUpdate(changed);

        if (this.#seeded || !this.data) return;

        const range = this.data.ranges[this.data.index];
        if (!range) return;

        this._start = range.start;
        this._end = range.end;
        this._label = range.label ?? '';
        this._byAppointmentOnly = range.byAppointmentOnly;
        this.#seeded = true;
    }

    /** All day is only offered when this is the day's only range - it would conflict with any other. */
    private get _canBeAllDay(): boolean {
        return (this.data?.ranges.length ?? 0) <= 1;
    }

    private get _isAllDay(): boolean {
        return this._start === '00:00' && this._end === formatTime(DAY_MINUTES);
    }

    private _toggleAllDay() {
        if (this._isAllDay) {
            this._start = '09:00';
            this._end = '17:00';
        } else {
            this._start = '00:00';
            this._end = formatTime(DAY_MINUTES);
        }
    }

    private _save() {
        if (!this.data) return;

        const start = parseTime(this._start);
        const end = parseTime(this._end);

        // Dragging cannot produce an overlap, but typing here can.
        this._error = validateRange(this.data.ranges, this.data.index, start, end);
        if (this._error) return;

        const ranges = [...this.data.ranges];
        ranges[this.data.index] = {
            start: formatTime(start),
            end: formatTime(end),
            label: this._label.trim() || null,
            byAppointmentOnly: this._byAppointmentOnly,
        };

        this.updateValue({ ranges });
        this._submitModal();
    }

    private _remove() {
        if (!this.data) return;

        this.updateValue({ ranges: this.data.ranges.filter((_, i) => i !== this.data!.index) });
        this._submitModal();
    }

    static styles = css`
        .field {
            margin-bottom: var(--uui-size-space-4);
        }
        .label {
            font-size: var(--uui-type-small-size);
            margin-bottom: var(--uui-size-space-1);
        }
        .error {
            color: var(--uui-color-danger);
            font-size: var(--uui-type-small-size);
        }
    `;

    render() {
        return html`
            <umb-body-layout headline="Edit hours">
                <uui-box>
                    <div class="field">
                        <div class="label">Starts at</div>
                        <uui-input
                            type="time"
                            .value=${this._start}
                            label="Starts at"
                            @change=${(e: Event) => (this._start = (e.target as HTMLInputElement).value)}>
                        </uui-input>
                    </div>

                    <div class="field">
                        <div class="label">Ends at</div>
                        <uui-input
                            type="time"
                            .value=${this._end === formatTime(DAY_MINUTES) ? '23:59' : this._end}
                            label="Ends at"
                            @change=${(e: Event) => (this._end = (e.target as HTMLInputElement).value)}>
                        </uui-input>
                    </div>

                    ${this._canBeAllDay
                        ? html`<div class="field">
                              <uui-toggle
                                  .checked=${this._isAllDay}
                                  label="All day"
                                  @change=${this._toggleAllDay}>
                                  All day
                              </uui-toggle>
                          </div>`
                        : ''}

                    <div class="field">
                        <div class="label">Label <span>(optional)</span></div>
                        <uui-input
                            .value=${this._label}
                            label="Label"
                            @input=${(e: Event) => (this._label = (e.target as HTMLInputElement).value)}>
                        </uui-input>
                    </div>

                    ${this.data?.showAppointmentOnly
                        ? html`<div class="field">
                              <uui-toggle
                                  .checked=${this._byAppointmentOnly}
                                  label="By appointment only"
                                  @change=${() => (this._byAppointmentOnly = !this._byAppointmentOnly)}>
                                  By appointment only
                              </uui-toggle>
                          </div>`
                        : ''}

                    ${this._error ? html`<div class="error">${this._error}</div>` : ''}
                </uui-box>

                <uui-button
                    slot="actions"
                    look="secondary"
                    color="danger"
                    label="Remove"
                    @click=${this._remove}>
                    Remove
                </uui-button>
                <uui-button
                    slot="actions"
                    look="secondary"
                    label="Cancel"
                    @click=${() => this._rejectModal()}>
                    Cancel
                </uui-button>
                <uui-button
                    slot="actions"
                    look="primary"
                    color="positive"
                    label="Save"
                    @click=${this._save}>
                    Save
                </uui-button>
            </umb-body-layout>
        `;
    }
}

export default OocRangeModalElement;

declare global {
    interface HTMLElementTagNameMap {
        'ooc-range-modal': OocRangeModalElement;
    }
}
