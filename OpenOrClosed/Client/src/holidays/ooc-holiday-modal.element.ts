import { css, customElement, html, state } from '@umbraco-cms/backoffice/external/lit';
import { UmbModalBaseElement, umbOpenModal } from '@umbraco-cms/backoffice/modal';
import { formatRange, sanitizeRanges, type HoursRange } from '../timeline/time-range.js';
import { OOC_RANGE_MODAL } from '../timeline/range-modal.token.js';
import '../timeline/ooc-timeline.element.js';
import {
    emptyHoliday,
    endFollowingStart,
    holidayConsistencyError,
    todayIso,
    validateHoliday,
    type HolidayError,
    type HolidayHoursMode,
} from './holiday.js';
import type { OocHolidayModalData, OocHolidayModalValue } from './holiday-modal.token.js';

const MODES: Array<{ value: HolidayHoursMode; key: string }> = [
    { value: 'default', key: 'general_default' },
    { value: 'closed', key: 'openOrClosed_hoursClosed' },
    { value: 'custom', key: 'openOrClosed_hoursCustom' },
];

/**
 * Edits one holiday in a sidebar. Removal comes back as a null holiday, the same way the range
 * modal returns a shorter array, so the caller needs no separate "removed" flag.
 */
@customElement('ooc-holiday-modal')
export class OocHolidayModalElement extends UmbModalBaseElement<
    OocHolidayModalData,
    OocHolidayModalValue
> {
    @state() private _name = '';
    @state() private _start = '';
    @state() private _end = '';
    @state() private _repeatYearly = false;
    @state() private _hoursMode: HolidayHoursMode = 'default';
    @state() private _hours: HoursRange[] = [];
    @state() private _error: HolidayError | null = null;

    /** The modal manager sets `data` asynchronously, so seed the fields the first time it arrives. */
    #seeded = false;

    willUpdate(changed: Map<string, unknown>) {
        super.willUpdate(changed);

        if (this.#seeded || !this.data) return;

        const holiday = this.data.holiday ?? emptyHoliday(todayIso());

        this._name = holiday.name;
        this._start = holiday.start;
        this._end = holiday.end;
        this._repeatYearly = holiday.repeatYearly;
        this._hoursMode = holiday.hoursMode;
        this._hours = sanitizeRanges(holiday.hours);
        this.#seeded = true;
    }

    private get _current() {
        return {
            name: this._name,
            start: this._start,
            end: this._end,
            repeatYearly: this._repeatYearly,
            hoursMode: this._hoursMode,
            hours: this._hours,
        };
    }

    private _setStart(value: string) {
        this._start = value;
        this._end = endFollowingStart(value, this._end);
    }

    private async _editRange(index: number) {
        try {
            const result = await umbOpenModal(this, OOC_RANGE_MODAL, {
                data: {
                    ranges: this._hours,
                    index,
                    showAppointmentOnly: this.data?.showAppointmentOnly ?? false,
                },
            });

            this._hours = result.ranges;
        } catch {
            // Dismissed - leave the hours as they were.
        }
    }

    /**
     * Shown as the editor types. Falls back to the Save-time error so a required-field message
     * raised by Save is not wiped out by the next keystroke.
     */
    private get _visibleError(): HolidayError | null {
        return holidayConsistencyError(this._current) ?? this._error;
    }

    /** Turns a validation code into a sentence. The pure module cannot localise; this can. */
    private _errorText(error: HolidayError | null): string | null {
        return error
            ? this.localize.term(
                  `openOrClosed_error${error.charAt(0).toUpperCase()}${error.slice(1)}`,
              )
            : null;
    }

    private _save() {
        this._error = validateHoliday(this._current);
        if (this._error) return;

        this.updateValue({ holiday: this._current });
        this._submitModal();
    }

    private _remove() {
        this.updateValue({ holiday: null });
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
        .dates {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: var(--uui-size-space-3);
        }
        .hint {
            color: var(--uui-color-text-alt);
            font-size: var(--uui-type-small-size);
        }
        .error {
            color: var(--uui-color-danger);
            font-size: var(--uui-type-small-size);
        }
    `;

    private _renderHoursMode() {
        return html`
            <div class="field">
                <div class="label">${this.localize.term('openOrClosed_fieldHours')}</div>
                <uui-button-group>
                    ${MODES.map(
                        (mode) => html`
                            <uui-button
                                look=${this._hoursMode === mode.value ? 'primary' : 'secondary'}
                                label=${this.localize.term(mode.key)}
                                @click=${() => (this._hoursMode = mode.value)}>
                                ${this.localize.term(mode.key)}
                            </uui-button>
                        `,
                    )}
                </uui-button-group>
            </div>
        `;
    }

    private _renderDefaultHint() {
        const ranges = sanitizeRanges(this.data?.defaultHours);
        const use24Hour = this.data?.use24Hour ?? true;

        return html`<div class="field hint">
            ${ranges.length === 0
                ? this.localize.term('openOrClosed_defaultHoursEmptyHint')
                : this.localize.term(
                      'openOrClosed_defaultHoursHint',
                      ranges.map((range) => formatRange(range, use24Hour)).join(', '),
                  )}
        </div>`;
    }

    render() {
        return html`
            <umb-body-layout headline=${this._name || this.localize.term('openOrClosed_holiday')}>
                <uui-box>
                    <div class="field">
                        <div class="label">${this.localize.term('general_name')}</div>
                        <uui-input
                            .value=${this._name}
                            label=${this.localize.term('general_name')}
                            @input=${(e: Event) => (this._name = (e.target as HTMLInputElement).value)}>
                        </uui-input>
                    </div>

                    <div class="field dates">
                        <div>
                            <div class="label">${this.localize.term('openOrClosed_startsOn')}</div>
                            <!--
                              Deliberately unconstrained. A max of _end would stop the start ever
                              moving past the end, which is exactly the gesture _setStart exists to
                              handle - the end follows instead.
                            -->
                            <uui-input
                                type="date"
                                .value=${this._start}
                                label=${this.localize.term('openOrClosed_startsOn')}
                                @change=${(e: Event) =>
                                    this._setStart((e.target as HTMLInputElement).value)}>
                            </uui-input>
                        </div>
                        <div>
                            <div class="label">${this.localize.term('openOrClosed_endsOn')}</div>
                            <uui-input
                                type="date"
                                .value=${this._end}
                                .min=${this._start}
                                label=${this.localize.term('openOrClosed_endsOn')}
                                @change=${(e: Event) =>
                                    (this._end = (e.target as HTMLInputElement).value)}>
                            </uui-input>
                        </div>
                    </div>

                    <div class="field">
                        <uui-toggle
                            .checked=${this._repeatYearly}
                            label=${this.localize.term('openOrClosed_repeatYearly')}
                            @change=${() => (this._repeatYearly = !this._repeatYearly)}>
                            ${this.localize.term('openOrClosed_repeatYearly')}
                        </uui-toggle>
                        <div class="hint">
                            ${this.localize.term('openOrClosed_repeatYearlyHint')}
                        </div>
                    </div>

                    ${this._renderHoursMode()}
                    ${this._hoursMode === 'default' ? this._renderDefaultHint() : ''}
                    ${this._hoursMode === 'custom'
                        ? html`<div class="field">
                              <ooc-timeline
                                  .ranges=${this._hours}
                                  .use24Hour=${this.data?.use24Hour ?? true}
                                  .showAppointmentOnly=${this.data?.showAppointmentOnly ?? false}
                                  .trackLabel=${this._name ||
                                  this.localize.term('openOrClosed_holiday')}
                                  @change=${(e: CustomEvent) => (this._hours = e.detail.ranges)}
                                  @edit-range=${(e: CustomEvent) => this._editRange(e.detail.index)}>
                              </ooc-timeline>
                          </div>`
                        : ''}
                    ${this._visibleError
                        ? html`<div class="error">${this._errorText(this._visibleError)}</div>`
                        : ''}
                </uui-box>

                <uui-button
                    slot="actions"
                    look="secondary"
                    color="danger"
                    label=${this.localize.term('general_remove')}
                    @click=${this._remove}>
                    ${this.localize.term('general_remove')}
                </uui-button>
                <uui-button
                    slot="actions"
                    look="secondary"
                    label=${this.localize.term('general_cancel')}
                    @click=${() => this._rejectModal()}>
                    ${this.localize.term('general_cancel')}
                </uui-button>
                <uui-button
                    slot="actions"
                    look="primary"
                    color="positive"
                    label=${this.localize.term('buttons_save')}
                    @click=${this._save}>
                    ${this.localize.term('buttons_save')}
                </uui-button>
            </umb-body-layout>
        `;
    }
}

export default OocHolidayModalElement;

declare global {
    interface HTMLElementTagNameMap {
        'ooc-holiday-modal': OocHolidayModalElement;
    }
}
