import { css, customElement, html, property } from '@umbraco-cms/backoffice/external/lit';
import { UmbLitElement } from '@umbraco-cms/backoffice/lit-element';
import { UmbChangeEvent } from '@umbraco-cms/backoffice/event';
import { umbOpenModal } from '@umbraco-cms/backoffice/modal';
import type {
    UmbPropertyEditorConfigCollection,
    UmbPropertyEditorUiElement,
} from '@umbraco-cms/backoffice/property-editor';
import {
    formatRange,
    sanitizePreset,
    sanitizeRanges,
    type HoursRange,
} from '../timeline/time-range.js';
import { OOC_RANGE_MODAL } from '../timeline/range-modal.token.js';
import '../timeline/ooc-timeline.element.js';
import { OOC_HOLIDAY_MODAL } from './holiday-modal.token.js';
import { OOC_COPY_TARGETS_MODAL } from '../copy-targets/copy-targets.token.js';
import {
    duplicateHoliday,
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

    /**
     * The configured blocks, ready to apply. The appointment flag is dropped here, as the setting is
     * read, rather than when a preset is applied - so the ghost preview shows exactly what a click
     * will produce.
     */
    private get _presetHours(): HoursRange[] {
        return sanitizePreset(this._setting('presetHours'), this._showAppointmentOnly);
    }

    private get _schedule(): HolidaySchedule {
        return sanitizeSchedule(this.value);
    }

    private _commit(schedule: HolidaySchedule) {
        this.value = schedule;

        // UmbChangeEvent is bubbles-but-not-composed on purpose: <umb-property> reads
        // composedPath()[0] and rejects anything whose target is not this element. That is why
        // ooc-timeline's own `change` event stays uncomposed - it must not escape this tree.
        this.dispatchEvent(new UmbChangeEvent());
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
                    presetHours: this._presetHours,
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

    /** Appends a copy and opens it, because the date is the reason you duplicated it. */
    private async _duplicateHoliday(index: number) {
        const holidays = sortHolidays(this._schedule.holidays);
        const source = holidays[index];
        if (!source) return;

        const copy = duplicateHoliday(
            source,
            holidays.map((entry) => entry.name),
            this.localize.term('openOrClosed_copyWord'),
        );

        const appended = [...holidays, copy];
        this._setHolidays(appended);

        // Re-sorted, so the copy is not where it was appended.
        void this._editHoliday(sortHolidays(appended).indexOf(copy));
    }

    /** Copies one holiday's whole hours setting - mode and blocks - onto others. */
    private async _copyHolidayHours(index: number) {
        const holidays = sortHolidays(this._schedule.holidays);
        const source = holidays[index];
        if (!source) return;

        try {
            const result = await umbOpenModal(this, OOC_COPY_TARGETS_MODAL, {
                data: {
                    sourceLabel: source.name || this.localize.term('openOrClosed_holiday'),
                    targets: holidays
                        .map((entry, position) => ({ entry, position }))
                        .filter(({ position }) => position !== index)
                        .map(({ entry, position }) => ({
                            id: String(position),
                            label: entry.name || this.localize.term('openOrClosed_holiday'),
                            // Only custom blocks are work worth warning about losing.
                            occupied:
                                entry.hoursMode === 'custom' &&
                                sanitizeRanges(entry.hours).length > 0,
                        })),
                },
            });

            const positions = new Set(result.ids.map(Number).filter(Number.isInteger));
            if (positions.size === 0) return;

            this._setHolidays(
                holidays.map((entry, position) =>
                    positions.has(position)
                        ? {
                              ...entry,
                              hoursMode: source.hoursMode,
                              hours: source.hours.map((range) => ({ ...range })),
                          }
                        : entry,
                ),
            );
        } catch {
            // Dismissed - nothing copied.
        }
    }

    private _clearHolidayHours(index: number) {
        const holidays = sortHolidays(this._schedule.holidays);
        if (!holidays[index]) return;

        this._setHolidays(
            holidays.map((entry, position) =>
                position === index ? { ...entry, hoursMode: 'default' as const, hours: [] } : entry,
            ),
        );
    }

    private _removeExpired() {
        const today = todayIso();
        this._setHolidays(this._schedule.holidays.filter((holiday) => !isExpired(holiday, today)));
    }

    /** The pill in the Hours column: what this holiday actually resolves to. */
    private _hoursSummary(holiday: Holiday): string {
        if (holiday.hoursMode === 'closed') return this.localize.term('openOrClosed_hoursClosed');
        if (holiday.hoursMode === 'default') return this.localize.term('general_default');

        const ranges = sanitizeRanges(holiday.hours);
        if (ranges.length === 0) return this.localize.term('openOrClosed_hoursClosed');

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
        .row-action {
            padding: 0;
            border: none;
            background: none;
            color: inherit;
            font: inherit;
            text-align: left;
            cursor: pointer;
        }
        .row-action:focus-visible {
            outline: 2px solid var(--uui-color-focus);
            outline-offset: 2px;
        }
        .pill {
            display: inline-block;
            padding: 0 var(--uui-size-space-2);
            border: 1px solid var(--uui-color-border);
            border-radius: 1em;
        }
        td.actions {
            width: 1%;
            text-align: right;
        }
        .sr-only {
            position: absolute;
            width: 1px;
            height: 1px;
            overflow: hidden;
            clip: rect(0 0 0 0);
            white-space: nowrap;
        }
        .empty {
            padding: var(--uui-size-space-4) 0;
            color: var(--uui-color-text-alt);
            font-size: var(--uui-type-small-size);
        }
    `;

    private _renderHolidayMenu(holiday: Holiday, index: number) {
        const hasOwnHours = holiday.hoursMode !== 'default' || holiday.hours.length > 0;

        return html`
            <umb-dropdown
                compact
                hide-expand
                look="secondary"
                label=${this.localize.term('openOrClosed_holidayActions', holiday.name)}>
                <uui-symbol-more slot="label"></uui-symbol-more>
                <uui-menu-item
                    label=${this.localize.term('openOrClosed_duplicateHoliday')}
                    @click-label=${() => this._duplicateHoliday(index)}></uui-menu-item>
                <uui-menu-item
                    label=${this.localize.term('openOrClosed_copyHoursTo')}
                    @click-label=${() => this._copyHolidayHours(index)}></uui-menu-item>
                <uui-menu-item
                    label=${this.localize.term('openOrClosed_clearHours')}
                    ?disabled=${!hasOwnHours}
                    @click-label=${() => this._clearHolidayHours(index)}></uui-menu-item>
            </umb-dropdown>
        `;
    }

    private _renderRow(holiday: Holiday, index: number, today: string) {
        const expired = isExpired(holiday, today);

        return html`
            <tr class="row ${expired ? 'expired' : ''}" @click=${() => this._editHoliday(index)}>
                <td>
                    <!--
                      A real button, not tabindex+role on the <tr>: role="button" on a row
                      destroys the table semantics screen readers rely on.
                    -->
                    <button
                        class="row-action"
                        type="button"
                        aria-label=${this.localize.term(
                            'openOrClosed_openHolidayAction',
                            holiday.name,
                        )}
                        @click=${(e: Event) => {
                            // The row also handles click; without this the modal opens twice.
                            e.stopPropagation();
                            this._editHoliday(index);
                        }}>
                        ${holiday.name}
                    </button>
                    ${expired
                        ? html` <em>${this.localize.term('openOrClosed_expiredSuffix')}</em>`
                        : ''}
                </td>
                <td>${formatDateRange(holiday)}</td>
                <td>${this.localize.term(holiday.repeatYearly ? 'general_yes' : 'general_no')}</td>
                <td><span class="pill">${this._hoursSummary(holiday)}</span></td>
                <!--
                  stopPropagation is not optional: the <tr> opens the holiday sidebar on click, so
                  without it opening this menu would open the holiday too.
                -->
                <td class="actions" @click=${(e: Event) => e.stopPropagation()}>
                    ${this._renderHolidayMenu(holiday, index)}
                </td>
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
                <div class="section-head">
                    <h4>${this.localize.term('openOrClosed_defaultHolidayHours')}</h4>
                </div>
                <ooc-timeline
                    .ranges=${schedule.defaultHours}
                    .preset=${this._presetHours}
                    .use24Hour=${this._use24Hour}
                    .showAppointmentOnly=${this._showAppointmentOnly}
                    .trackLabel=${this.localize.term('openOrClosed_defaultHolidayHours')}
                    @change=${(e: CustomEvent) => this._setDefaultHours(e.detail.ranges)}
                    @edit-range=${(e: CustomEvent) => this._editDefaultRange(e.detail.index)}>
                </ooc-timeline>
            </div>

            <div class="section">
                <div class="section-head">
                    <h4>${this.localize.term('openOrClosed_holidaysLabel')}</h4>
                    ${hasExpired
                        ? html`<uui-button
                              look="secondary"
                              label=${this.localize.term('openOrClosed_removeExpired')}
                              @click=${this._removeExpired}>
                              ${this.localize.term('openOrClosed_removeExpired')}
                          </uui-button>`
                        : ''}
                </div>

                ${holidays.length === 0
                    ? html`<div class="empty">
                          ${this.localize.term('openOrClosed_noHolidaysYet')}
                      </div>`
                    : html`<table>
                          <thead>
                              <tr>
                                  <th scope="col">${this.localize.term('general_name')}</th>
                                  <th scope="col">
                                      ${this.localize.term('openOrClosed_columnDates')}
                                  </th>
                                  <th scope="col">
                                      ${this.localize.term('openOrClosed_columnYearly')}
                                  </th>
                                  <th scope="col">
                                      ${this.localize.term('openOrClosed_columnHours')}
                                  </th>
                                  <th scope="col">
                                      <span class="sr-only"
                                          >${this.localize.term('general_actions')}</span
                                      >
                                  </th>
                              </tr>
                          </thead>
                          <tbody>
                              ${holidays.map((holiday, index) => this._renderRow(holiday, index, today))}
                          </tbody>
                      </table>`}

                <uui-button
                    look="placeholder"
                    label=${this.localize.term('openOrClosed_addHoliday')}
                    @click=${() => this._editHoliday(NEW_HOLIDAY)}>
                    + ${this.localize.term('openOrClosed_addHoliday')}
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
