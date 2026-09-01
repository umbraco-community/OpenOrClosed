import { css, customElement, html, property } from '@umbraco-cms/backoffice/external/lit';
import { UmbLitElement } from '@umbraco-cms/backoffice/lit-element';
import { DAY_MINUTES, formatAxis } from './time-range.js';

/**
 * The 00:00-24:00 scale drawn above a track. Presentational only - it has no ranges, no events and
 * no state, so both the weekly editor and the preset settings editor can mount it as-is.
 */
@customElement('ooc-time-axis')
export class OocTimeAxisElement extends UmbLitElement {
    @property({ type: Boolean })
    use24Hour = true;

    /** The two outer ticks are pulled inside the box; the rest are centred on their position. */
    private static readonly TICKS = [
        { at: 0, minutes: 0, cls: 'first' },
        { at: 25, minutes: 6 * 60, cls: '' },
        { at: 50, minutes: 12 * 60, cls: '' },
        { at: 75, minutes: 18 * 60, cls: '' },
        { at: 100, minutes: DAY_MINUTES, cls: 'last' },
    ];

    static styles = css`
        :host {
            display: block;
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
    `;

    render() {
        return html`${OocTimeAxisElement.TICKS.map(
            (tick) => html`<span class="tick ${tick.cls}" style="left:${tick.at}%"
                >${formatAxis(tick.minutes, this.use24Hour)}</span
            >`,
        )}`;
    }
}

export default OocTimeAxisElement;

declare global {
    interface HTMLElementTagNameMap {
        'ooc-time-axis': OocTimeAxisElement;
    }
}
