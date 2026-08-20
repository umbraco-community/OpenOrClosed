import { css, customElement, html, property } from '@umbraco-cms/backoffice/external/lit';
import { UmbLitElement } from '@umbraco-cms/backoffice/lit-element';
import { UmbChangeEvent } from '@umbraco-cms/backoffice/event';
import { umbOpenModal } from '@umbraco-cms/backoffice/modal';
import type {
    UmbPropertyEditorConfigCollection,
    UmbPropertyEditorUiElement,
} from '@umbraco-cms/backoffice/property-editor';
import {
    DAY_MINUTES,
    formatAxis,
    parseTime,
    sanitizeRanges,
    type HoursRange,
} from '../timeline/time-range.js';
import { OOC_RANGE_MODAL } from '../timeline/range-modal.token.js';
import '../timeline/ooc-timeline.element.js';

interface WeeklyHoursDay {
    day: number;
    ranges: HoursRange[];
}

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

    static styles = css`
        :host {
            display: block;
        }
        .row {
            display: grid;
            grid-template-columns: 90px 1fr;
            align-items: center;
            gap: var(--uui-size-space-3);
            margin-bottom: var(--uui-size-space-2);
        }
        .axis {
            position: relative;
            height: 18px;
        }
        .tick {
            position: absolute;
            font-size: var(--uui-type-small-size);
            color: var(--uui-color-text-alt);
            transform: translateX(-50%);
        }
        .tick.first {
            transform: none;
        }
        .tick.last {
            transform: translateX(-100%);
        }
        .day {
            font-size: var(--uui-type-small-size);
        }
    `;

    private _renderAxis() {
        const ticks = [
            { at: 0, minutes: 0, cls: 'first' },
            { at: 25, minutes: 6 * 60, cls: '' },
            { at: 50, minutes: 12 * 60, cls: '' },
            { at: 75, minutes: 18 * 60, cls: '' },
            { at: 100, minutes: DAY_MINUTES, cls: 'last' },
        ];

        return html`<div class="row">
            <div></div>
            <div class="axis">
                ${ticks.map(
                    (tick) => html`<span class="tick ${tick.cls}" style="left:${tick.at}%"
                        >${formatAxis(tick.minutes, this._use24Hour)}</span
                    >`,
                )}
            </div>
        </div>`;
    }

    render() {
        return html`
            ${this._renderAxis()}
            ${WEEK.map(
                (day) => html`
                    <div class="row">
                        <div class="day">${dayName(day)}</div>
                        <ooc-timeline
                            .ranges=${this._rangesFor(day)}
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
