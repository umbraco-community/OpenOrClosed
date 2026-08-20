import { html, css, customElement, property } from '@umbraco-cms/backoffice/external/lit';
import { UmbElementMixin } from '@umbraco-cms/backoffice/element-api';
import { UmbChangeEvent } from '@umbraco-cms/backoffice/event';
import { UmbLitElement } from '@umbraco-cms/backoffice/lit-element';
import type { UmbPropertyEditorUiElement } from '@umbraco-cms/backoffice/property-editor';

@customElement('ooc-time-input-property-editor')
export class OocTimeInputPropertyEditorElement extends UmbElementMixin(UmbLitElement) implements UmbPropertyEditorUiElement {

    @property({ type: String })
    value = '';

    @property({ type: Object })
    config?: any;

    #onChange(e: Event) {
        this.value = (e.target as HTMLInputElement).value;
        this.dispatchEvent(new UmbChangeEvent());
    }

    static styles = css`
        :host {
            display: block;
        }
    `;

    render() {
        return html`
            <uui-input
                type="time"
                .value=${this.value}
                @input=${this.#onChange}
                placeholder="HH:MM"
                label="Time">
            </uui-input>
        `;
    }
}

export default OocTimeInputPropertyEditorElement;

declare global {
    interface HTMLElementTagNameMap {
        'ooc-time-input-property-editor': OocTimeInputPropertyEditorElement;
    }
}