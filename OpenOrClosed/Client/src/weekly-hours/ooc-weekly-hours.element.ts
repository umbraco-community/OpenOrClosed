import { css, customElement, html, property } from '@umbraco-cms/backoffice/external/lit';
import { UmbLitElement } from '@umbraco-cms/backoffice/lit-element';
import { UmbChangeEvent } from '@umbraco-cms/backoffice/event';
import { umbOpenModal } from '@umbraco-cms/backoffice/modal';
import type {
    UmbPropertyEditorConfigCollection,
    UmbPropertyEditorUiElement,
} from '@umbraco-cms/backoffice/property-editor';
import {
    parseTime,
    sanitizePreset,
    sanitizeRanges,
    type HoursRange,
} from '../timeline/time-range.js';
import { OOC_RANGE_MODAL } from '../timeline/range-modal.token.js';
import '../timeline/ooc-time-axis.element.js';
import '../timeline/ooc-timeline.element.js';
import { copyRangesTo, type WeeklyHoursDay } from './week.js';
import { OOC_COPY_TARGETS_MODAL } from '../copy-targets/copy-targets.token.js';

// Re-exported so the clipboard manifest and anything else that reached for it here still can.
export type { WeeklyHoursDay } from './week.js';

/**
 * Monday first. The stored `day` values follow System.DayOfWeek, where Sunday is 0.
 *
 * Names are not listed here: they come from the browser's culture, which is also what keeps
 * them in step with the server's CultureInfo.CurrentCulture.
 */
const WEEK = [1, 2, 3, 4, 5, 6, 0];

/** 4 January 2026 is a Sunday, so this array is indexed directly by System.DayOfWeek. */
const DAY_NAME_REFERENCE = [4, 5, 6, 7, 8, 9, 10].map((date) => new Date(2026, 0, date));

function dayName(day: number): string {
    return new Intl.DateTimeFormat(undefined, { weekday: 'long' }).format(
        DAY_NAME_REFERENCE[day],
    );
}

@customElement('ooc-weekly-hours')
export class OocWeeklyHoursElement extends UmbLitElement implements UmbPropertyEditorUiElement {
    @property({ type: Array })
    value: WeeklyHoursDay[] = [];

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

    private get _defaultDuration(): number {
        const open = (this._setting('defaultOpen') as string) ?? '09:00';
        const close = (this._setting('defaultClose') as string) ?? '17:00';

        try {
            const duration = parseTime(close) - parseTime(open);
            return duration > 0 ? duration : 8 * 60;
        } catch {
            return 8 * 60;
        }
    }

    /**
     * The configured blocks, ready to apply. The appointment flag is dropped here, as the setting is
     * read, rather than when a preset is applied - so the ghost preview shows exactly what a click
     * will produce.
     */
    private get _presetHours(): HoursRange[] {
        return sanitizePreset(this._setting('presetHours'), this._showAppointmentOnly);
    }

    private _rangesFor(day: number): HoursRange[] {
        return sanitizeRanges(this.value?.find((entry) => entry.day === day)?.ranges);
    }

    /** Opens the range editor as a sidebar. Closing it without saving simply rejects. */
    private async _editRange(day: number, index: number) {
        const ranges = this._rangesFor(day);

        try {
            const result = await umbOpenModal(this, OOC_RANGE_MODAL, {
                data: {
                    ranges,
                    index,
                    showAppointmentOnly: this._showAppointmentOnly,
                },
            });

            this._setRanges(day, result.ranges);
        } catch {
            // Dismissed - leave the day as it was.
        }
    }

    private _setRanges(day: number, ranges: HoursRange[]) {
        const others = (this.value ?? []).filter((entry) => entry.day !== day);
        this.value = ranges.length > 0 ? [...others, { day, ranges }] : others;

        // UmbChangeEvent is bubbles-but-not-composed on purpose: <umb-property> reads
        // composedPath()[0] and rejects anything whose target is not this element.
        this.dispatchEvent(new UmbChangeEvent());
    }

    /** Saturday and Sunday, as System.DayOfWeek numbers. */
    private static readonly WEEKEND = [6, 0];

    private async _copyDay(day: number) {
        const others = WEEK.filter((entry) => entry !== day);

        const groups = [
            {
                label: this.localize.term('openOrClosed_groupWeekdays'),
                ids: others.filter((entry) => !OocWeeklyHoursElement.WEEKEND.includes(entry)),
            },
            {
                label: this.localize.term('openOrClosed_groupWeekend'),
                ids: others.filter((entry) => OocWeeklyHoursElement.WEEKEND.includes(entry)),
            },
            { label: this.localize.term('general_all'), ids: others },
        ]
            // Drop a group offering nothing - Weekend, when the source is a weekend day and only one
            // other remains, still offers one; Weekend with no members cannot happen, but a future
            // group could.
            .filter((group) => group.ids.length > 0)
            .map((group) => ({ label: group.label, ids: group.ids.map(String) }));

        try {
            const result = await umbOpenModal(this, OOC_COPY_TARGETS_MODAL, {
                data: {
                    sourceLabel: dayName(day),
                    targets: others.map((entry) => ({
                        id: String(entry),
                        label: dayName(entry),
                        occupied: this._rangesFor(entry).length > 0,
                    })),
                    groups,
                },
            });

            const days = result.ids.map(Number).filter(Number.isInteger);
            if (days.length === 0) return;

            this.value = copyRangesTo(this.value ?? [], day, days);
            this.dispatchEvent(new UmbChangeEvent());
        } catch {
            // Dismissed - nothing copied.
        }
    }

    static styles = css`
        :host {
            display: block;
        }
        .row {
            display: grid;
            grid-template-columns: 90px 24px 1fr;
            align-items: center;
            gap: var(--uui-size-space-3);
            margin-bottom: var(--uui-size-space-2);
        }
        .day {
            font-size: var(--uui-type-small-size);
        }
    `;

    private _renderDayMenu(day: number) {
        // Both actions need hours to act on, so an empty day offers a menu that does nothing - which
        // is better than no menu at all, because the row stays the same shape.
        const hasHours = this._rangesFor(day).length > 0;

        return html`
            <umb-dropdown
                compact
                hide-expand
                look="secondary"
                label=${this.localize.term('openOrClosed_dayActions', dayName(day))}>
                <uui-symbol-more slot="label"></uui-symbol-more>
                <uui-menu-item
                    label=${this.localize.term('openOrClosed_copyHoursTo')}
                    ?disabled=${!hasHours}
                    @click-label=${() => this._copyDay(day)}></uui-menu-item>
                <uui-menu-item
                    label=${this.localize.term('openOrClosed_clearHours')}
                    ?disabled=${!hasHours}
                    @click-label=${() => this._setRanges(day, [])}></uui-menu-item>
            </umb-dropdown>
        `;
    }

    private _renderAxis() {
        return html`<div class="row">
            <div></div>
            <div></div>
            <ooc-time-axis .use24Hour=${this._use24Hour}></ooc-time-axis>
        </div>`;
    }

    render() {
        // Hoisted: sanitising the setting once beats doing it seven times.
        const preset = this._presetHours;

        return html`
            ${this._renderAxis()}
            ${WEEK.map(
                (day) => html`
                    <div class="row">
                        <div class="day">${dayName(day)}</div>
                        ${this._renderDayMenu(day)}
                        <ooc-timeline
                            .ranges=${this._rangesFor(day)}
                            .preset=${preset}
                            .use24Hour=${this._use24Hour}
                            .showAppointmentOnly=${this._showAppointmentOnly}
                            .defaultDurationMinutes=${this._defaultDuration}
                            .trackLabel=${dayName(day)}
                            @change=${(e: CustomEvent) => this._setRanges(day, e.detail.ranges)}
                            @edit-range=${(e: CustomEvent) => this._editRange(day, e.detail.index)}>
                        </ooc-timeline>
                    </div>
                `,
            )}
        `;
    }
}

export default OocWeeklyHoursElement;

declare global {
    interface HTMLElementTagNameMap {
        'ooc-weekly-hours': OocWeeklyHoursElement;
    }
}
