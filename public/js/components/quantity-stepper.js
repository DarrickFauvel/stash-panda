/**
 * <quantity-stepper> — progressive-enhancement web component
 *
 * Usage:
 *   <quantity-stepper>
 *     <button type="button" data-action="decrement">−</button>
 *     <input type="number" value="1" min="0" step="1">
 *     <button type="button" data-action="increment">+</button>
 *   </quantity-stepper>
 *
 * No Shadow DOM — global CSS applies naturally.
 * If JS fails, the plain HTML still renders and works.
 */
class QuantityStepper extends HTMLElement {
  connectedCallback() {
    this.addEventListener('click', this)
  }

  disconnectedCallback() {
    this.removeEventListener('click', this)
  }

  handleEvent(e) {
    const action = e.target.closest('[data-action]')?.dataset.action
    if (!action) return

    const input = this.querySelector('input[type="number"]')
    if (!input) return

    const step = Math.abs(Math.round(Number(input.step)) || 1)
    const min = input.min !== '' ? Number(input.min) : -Infinity
    const current = Math.round(Number(input.value) || 0)

    if (action === 'increment') {
      input.value = current + step
    } else if (action === 'decrement') {
      input.value = Math.max(min, current - step)
    }

    input.dispatchEvent(new Event('change', { bubbles: true }))
    input.dispatchEvent(new Event('input',  { bubbles: true }))
  }
}

customElements.define('quantity-stepper', QuantityStepper)
