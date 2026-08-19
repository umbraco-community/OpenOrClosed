import { css, customElement, html, LitElement, property } from '@umbraco-cms/backoffice/external/lit';
import {
    DAY_MINUTES,
    DEFAULT_SNAP_MINUTES,
    formatRange,
    parseTime,
    type HoursRange,
} from './time-range.js';

/**
 * One 00:00-24:00 track carrying any number of non-overlapping ranges.
 *
 * Knows nothing about days, holidays or Umbraco, so the weekly editor, the holidays default track
 * and the per-holiday track can all use it unchanged.
 */
@customElement('ooc-timeline')
export class OocTimelineElement extends LitElement {
    @property({ type: Array })
    ranges: HoursRange[] = [];

    @property({ type: Number })
    snapMinutes = DEFAULT_SNAP_MINUTES;

    @property({ type: Boolean })
    use24Hour = true;

    @property({ type: Boolean })
    showAppointmentOnly = false;

    /** Prefixed onto every block's accessible name, e.g. "Monday". */
    @property({ type: String })
    trackLabel = '';

    protected _percent(minutes: number): number {
        return (minutes / DAY_MINUTES) * 100;
    }

    protected _accessibleName(range: HoursRange): string {
        const parts = [this.trackLabel, formatRange(range, this.use24Hour)];
        if (range.label) parts.push(range.label);
        if (range.byAppointmentOnly) parts.push('by appointment only');
        return parts.filter(Boolean).join(', ');
    }

    static styles = css`
        :host {
            display: block;
        }

        .track {
            position: relative;
            height: 40px;
            border: 1px solid var(--uui-color-border);
            border-radius: var(--uui-border-radius);
            background: var(--uui-color-surface);
        }

        .divider {
            position: absolute;
            top: 0;
            bottom: 0;
            width: 1px;
            background: var(--uui-color-border);
        }

        .block {
            position: absolute;
            top: 3px;
            bottom: 3px;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 4px;
            padding: 0 4px;
            border: 1px solid var(--uui-color-selected);
            border-radius: var(--uui-border-radius);
            background: var(--uui-color-surface-alt);
            color: var(--uui-color-selected);
            font-size: var(--uui-type-small-size);
            white-space: nowrap;
            overflow: hidden;
            cursor: pointer;
        }

        .block:focus-visible {
            outline: 2px solid var(--uui-color-focus);
            outline-offset: 1px;
        }

        .block .times {
            overflow: hidden;
            text-overflow: ellipsis;
        }
    `;

    protected _renderBlock(range: HoursRange, index: number) {
        const start = parseTime(range.start);
        const end = parseTime(range.end);

        return html`
            <button
                type="button"
                class="block"
                part="block"
                data-index=${index}
                style="left:${this._percent(start)}%;width:${this._percent(end - start)}%"
                title=${this._accessibleName(range)}
                aria-label=${this._accessibleName(range)}>
                ${range.label ? html`<uui-icon name="icon-notepad"></uui-icon>` : ''}
                ${this.showAppointmentOnly && range.byAppointmentOnly
                    ? html`<uui-icon name="icon-user"></uui-icon>`
                    : ''}
                <span class="times">${formatRange(range, this.use24Hour)}</span>
            </button>
        `;
    }

    render() {
        return html`
            <div class="track" part="track">
                ${[6, 12, 18].map(
                    (hour) => html`<i class="divider" style="left:${this._percent(hour * 60)}%"></i>`,
                )}
                ${this.ranges.map((range, index) => this._renderBlock(range, index))}
            </div>
        `;
    }
}

export default OocTimelineElement;

declare global {
    interface HTMLElementTagNameMap {
        'ooc-timeline': OocTimelineElement;
    }
}
