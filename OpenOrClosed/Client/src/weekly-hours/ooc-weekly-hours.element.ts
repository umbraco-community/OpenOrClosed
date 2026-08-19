import { css, customElement, html, property } from '@umbraco-cms/backoffice/external/lit';
import { UmbLitElement } from '@umbraco-cms/backoffice/lit-element';
import { umbOpenModal } from '@umbraco-cms/backoffice/modal';
import type {
    UmbPropertyEditorConfigCollection,
    UmbPropertyEditorUiElement,
} from '@umbraco-cms/backoffice/property-editor';
import { parseTime, sanitizeRanges, type HoursRange } from '../timeline/time-range.js';
import { OOC_RANGE_MODAL } from '../timeline/range-modal.token.js';
import '../timeline/ooc-timeline.element.js';

interface WeeklyHoursDay {
    day: number;
    ranges: HoursRange[];
}

/** Monday first. The stored `day` values follow System.DayOfWeek, where Sunday is 0. */
const WEEK = [
    { day: 1, name: 'Monday' },
    { day: 2, name: 'Tuesday' },
    { day: 3, name: 'Wednesday' },
    { day: 4, name: 'Thursday' },
    { day: 5, name: 'Friday' },
    { day: 6, name: 'Saturday' },
    { day: 0, name: 'Sunday' },
];

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
                    use24Hour: this._use24Hour,
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

        this.dispatchEvent(new CustomEvent('property-value-change', { bubbles: true, composed: true }));
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
            { at: 0, text: '12 AM', cls: 'first' },
            { at: 25, text: '06 AM', cls: '' },
            { at: 50, text: '12 PM', cls: '' },
            { at: 75, text: '06 PM', cls: '' },
            { at: 100, text: '12 AM', cls: 'last' },
        ];

        return html`<div class="row">
            <div></div>
            <div class="axis">
                ${ticks.map(
                    (tick) => html`<span class="tick ${tick.cls}" style="left:${tick.at}%">${tick.text}</span>`,
                )}
            </div>
        </div>`;
    }

    render() {
        return html`
            ${this._renderAxis()}
            ${WEEK.map(
                (entry) => html`
                    <div class="row">
                        <div class="day">${entry.name}</div>
                        <ooc-timeline
                            .ranges=${this._rangesFor(entry.day)}
                            .use24Hour=${this._use24Hour}
                            .showAppointmentOnly=${this._showAppointmentOnly}
                            .defaultDurationMinutes=${this._defaultDuration}
                            .trackLabel=${entry.name}
                            @change=${(e: CustomEvent) => this._setRanges(entry.day, e.detail.ranges)}
                            @edit-range=${(e: CustomEvent) => this._editRange(entry.day, e.detail.index)}>
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
