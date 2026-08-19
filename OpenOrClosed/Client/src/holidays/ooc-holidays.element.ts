import { css, customElement, html, property } from '@umbraco-cms/backoffice/external/lit';
import { UmbLitElement } from '@umbraco-cms/backoffice/lit-element';
import { umbOpenModal } from '@umbraco-cms/backoffice/modal';
import type {
    UmbPropertyEditorConfigCollection,
    UmbPropertyEditorUiElement,
} from '@umbraco-cms/backoffice/property-editor';
import { formatRange, sanitizeRanges, type HoursRange } from '../timeline/time-range.js';
import { OOC_RANGE_MODAL } from '../timeline/range-modal.token.js';
import '../timeline/ooc-timeline.element.js';
import { OOC_HOLIDAY_MODAL } from './holiday-modal.token.js';
import {
    emptyHoliday,
    formatDateRange,
    isExpired,
    sanitizeSchedule,
    sortHolidays,
    todayIso,
    type Holiday,
    type HolidaySchedule,
} from './holiday.js';

/** Passed to `_editHoliday` to mean "append a new one" rather than edit an existing row. */
const NEW_HOLIDAY = -1;

@customElement('ooc-holidays')
export class OocHolidaysElement extends UmbLitElement implements UmbPropertyEditorUiElement {
    @property({ type: Object })
    value: HolidaySchedule = { defaultHours: [], holidays: [] };

    @property({ attribute: false })
    config?: UmbPropertyEditorConfigCollection;

    private _setting(alias: string): unknown {
        return this.config?.getValueByAlias(alias);
    }

    private get _use24Hour(): boolean {
        // Only an explicit false turns it off; an unset value keeps the 24-hour default.
        return this._setting('time_24hr') !== false;
    }

    private get _showAppointmentOnly(): boolean {
        return this._setting('showAppointmentOnly') === true;
    }

    private get _schedule(): HolidaySchedule {
        return sanitizeSchedule(this.value);
    }

    private _commit(schedule: HolidaySchedule) {
        this.value = schedule;

        // property-value-change is the only event that leaves this shadow tree. A composed
        // `change` event would land on Umbraco's <umb-property> and be rejected.
        this.dispatchEvent(new CustomEvent('property-value-change', { bubbles: true, composed: true }));
    }

    private _setDefaultHours(defaultHours: HoursRange[]) {
        this._commit({ ...this._schedule, defaultHours });
    }

    private _setHolidays(holidays: Holiday[]) {
        this._commit({ ...this._schedule, holidays });
    }

    private async _editDefaultRange(index: number) {
        try {
            const result = await umbOpenModal(this, OOC_RANGE_MODAL, {
                data: {
                    ranges: this._schedule.defaultHours,
                    index,
                    use24Hour: this._use24Hour,
                    showAppointmentOnly: this._showAppointmentOnly,
                },
            });

            this._setDefaultHours(result.ranges);
        } catch {
            // Dismissed - leave the default hours as they were.
        }
    }

    /** `index` is a position in the sorted list, or NEW_HOLIDAY to add one. */
    private async _editHoliday(index: number) {
        const schedule = this._schedule;
        const holidays = sortHolidays(schedule.holidays);
        const holiday = index === NEW_HOLIDAY ? emptyHoliday(todayIso()) : holidays[index];

        if (!holiday) return;

        try {
            const result = await umbOpenModal(this, OOC_HOLIDAY_MODAL, {
                data: {
                    holiday,
                    defaultHours: schedule.defaultHours,
                    use24Hour: this._use24Hour,
                    showAppointmentOnly: this._showAppointmentOnly,
                },
            });

            if (result.holiday === null) {
                this._setHolidays(holidays.filter((_, i) => i !== index));
                return;
            }

            this._setHolidays(
                index === NEW_HOLIDAY
                    ? [...holidays, result.holiday]
                    : holidays.map((entry, i) => (i === index ? result.holiday! : entry)),
            );
        } catch {
            // Dismissed - leave the holiday as it was.
        }
    }

    private _removeExpired() {
        const today = todayIso();
        this._setHolidays(this._schedule.holidays.filter((holiday) => !isExpired(holiday, today)));
    }

    /** The pill in the Hours column: what this holiday actually resolves to. */
    private _hoursSummary(holiday: Holiday): string {
        if (holiday.hoursMode === 'closed') return 'Closed';
        if (holiday.hoursMode === 'default') return 'Default';

        const ranges = sanitizeRanges(holiday.hours);
        if (ranges.length === 0) return 'Closed';

        const first = formatRange(ranges[0], this._use24Hour);
        return ranges.length > 1 ? `${first} +${ranges.length - 1}` : first;
    }

    static styles = css`
        :host {
            display: block;
        }
        .section {
            margin-bottom: var(--uui-size-space-5);
        }
        .section-head {
            display: flex;
            align-items: center;
            justify-content: space-between;
            margin-bottom: var(--uui-size-space-2);
        }
        h4 {
            margin: 0;
            font-size: var(--uui-type-small-size);
        }
        table {
            width: 100%;
            border-collapse: collapse;
            margin-bottom: var(--uui-size-space-2);
        }
        th {
            text-align: left;
            font-size: var(--uui-type-small-size);
            color: var(--uui-color-text-alt);
            font-weight: normal;
            padding: var(--uui-size-space-2);
            border-bottom: 1px solid var(--uui-color-border);
        }
        td {
            padding: var(--uui-size-space-2);
            border-bottom: 1px solid var(--uui-color-border);
            font-size: var(--uui-type-small-size);
        }
        tr.row {
            cursor: pointer;
        }
        tr.row:hover td {
            background: var(--uui-color-surface-alt);
        }
        /* Expired rows stay visible: a mistyped date nobody can see is one nobody can fix. */
        tr.expired td {
            opacity: 0.6;
        }
        .pill {
            display: inline-block;
            padding: 0 var(--uui-size-space-2);
            border: 1px solid var(--uui-color-border);
            border-radius: 1em;
        }
        .empty {
            padding: var(--uui-size-space-4) 0;
            color: var(--uui-color-text-alt);
            font-size: var(--uui-type-small-size);
        }
    `;

    private _renderRow(holiday: Holiday, index: number, today: string) {
        const expired = isExpired(holiday, today);

        return html`
            <tr class="row ${expired ? 'expired' : ''}" @click=${() => this._editHoliday(index)}>
                <td>${holiday.name}${expired ? html` <em>(Expired)</em>` : ''}</td>
                <td>${formatDateRange(holiday)}</td>
                <td>${holiday.repeatYearly ? 'Yes' : 'No'}</td>
                <td><span class="pill">${this._hoursSummary(holiday)}</span></td>
            </tr>
        `;
    }

    render() {
        const schedule = this._schedule;
        const holidays = sortHolidays(schedule.holidays);
        const today = todayIso();
        const hasExpired = holidays.some((holiday) => isExpired(holiday, today));

        return html`
            <div class="section">
                <div class="section-head"><h4>Default holiday hours</h4></div>
                <ooc-timeline
                    .ranges=${schedule.defaultHours}
                    .use24Hour=${this._use24Hour}
                    .showAppointmentOnly=${this._showAppointmentOnly}
                    .trackLabel=${'Default holiday hours'}
                    @change=${(e: CustomEvent) => this._setDefaultHours(e.detail.ranges)}
                    @edit-range=${(e: CustomEvent) => this._editDefaultRange(e.detail.index)}>
                </ooc-timeline>
            </div>

            <div class="section">
                <div class="section-head">
                    <h4>Holidays</h4>
                    ${hasExpired
                        ? html`<uui-button
                              look="secondary"
                              label="Remove expired"
                              @click=${this._removeExpired}>
                              Remove expired
                          </uui-button>`
                        : ''}
                </div>

                ${holidays.length === 0
                    ? html`<div class="empty">No holidays yet.</div>`
                    : html`<table>
                          <thead>
                              <tr>
                                  <th>Name</th>
                                  <th>Dates</th>
                                  <th>Yearly</th>
                                  <th>Hours</th>
                              </tr>
                          </thead>
                          <tbody>
                              ${holidays.map((holiday, index) => this._renderRow(holiday, index, today))}
                          </tbody>
                      </table>`}

                <uui-button
                    look="placeholder"
                    label="Add holiday"
                    @click=${() => this._editHoliday(NEW_HOLIDAY)}>
                    + Add holiday
                </uui-button>
            </div>
        `;
    }
}

export default OocHolidaysElement;

declare global {
    interface HTMLElementTagNameMap {
        'ooc-holidays': OocHolidaysElement;
    }
}
