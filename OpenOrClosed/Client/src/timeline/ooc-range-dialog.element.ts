import {
    css,
    customElement,
    html,
    LitElement,
    property,
    state,
} from '@umbraco-cms/backoffice/external/lit';
import { DAY_MINUTES, formatTime, parseTime, validateRange, type HoursRange } from './time-range.js';

/** Edits one range precisely. This is the keyboard route into exact times. */
@customElement('ooc-range-dialog')
export class OocRangeDialogElement extends LitElement {
    @property({ type: Array })
    ranges: HoursRange[] = [];

    @property({ type: Number })
    index = -1;

    @property({ type: Boolean })
    use24Hour = true;

    @property({ type: Boolean })
    showAppointmentOnly = false;

    @state() private _start = '09:00';
    @state() private _end = '17:00';
    @state() private _label = '';
    @state() private _byAppointmentOnly = false;
    @state() private _error: string | null = null;

    willUpdate(changed: Map<string, unknown>) {
        if (!changed.has('ranges') && !changed.has('index')) return;

        const range = this.ranges[this.index];
        if (!range) return;

        this._start = range.start;
        this._end = range.end;
        this._label = range.label ?? '';
        this._byAppointmentOnly = range.byAppointmentOnly;
        this._error = null;
    }

    /** All day is only offered when this is the day's only range - it would conflict with any other. */
    private get _canBeAllDay(): boolean {
        return this.ranges.length <= 1;
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
        const start = parseTime(this._start);
        const end = parseTime(this._end);

        this._error = validateRange(this.ranges, this.index, start, end);
        if (this._error) return;

        const updated = [...this.ranges];
        updated[this.index] = {
            start: formatTime(start),
            end: formatTime(end),
            label: this._label.trim() || null,
            byAppointmentOnly: this._byAppointmentOnly,
        };

        this.dispatchEvent(new CustomEvent('save', { detail: { ranges: updated }, bubbles: true, composed: true }));
    }

    static styles = css`
        :host {
            display: block;
        }
        .field {
            margin-bottom: var(--uui-size-space-3);
        }
        .label {
            font-size: var(--uui-type-small-size);
            margin-bottom: var(--uui-size-space-1);
        }
        .error {
            color: var(--uui-color-danger);
            font-size: var(--uui-type-small-size);
            margin-bottom: var(--uui-size-space-3);
        }
        .actions {
            display: flex;
            justify-content: space-between;
            align-items: center;
            gap: var(--uui-size-space-3);
        }
    `;

    render() {
        return html`
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

            ${this.showAppointmentOnly
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

            <div class="actions">
                <uui-button
                    look="secondary"
                    color="danger"
                    label="Remove"
                    @click=${() =>
                        this.dispatchEvent(
                            new CustomEvent('remove', {
                                detail: { index: this.index },
                                bubbles: true,
                                composed: true,
                            }),
                        )}>
                    Remove
                </uui-button>
                <span>
                    <uui-button
                        look="secondary"
                        label="Cancel"
                        @click=${() =>
                            this.dispatchEvent(new CustomEvent('cancel', { bubbles: true, composed: true }))}>
                        Cancel
                    </uui-button>
                    <uui-button look="primary" color="positive" label="Save" @click=${this._save}>
                        Save
                    </uui-button>
                </span>
            </div>
        `;
    }
}

export default OocRangeDialogElement;

declare global {
    interface HTMLElementTagNameMap {
        'ooc-range-dialog': OocRangeDialogElement;
    }
}
