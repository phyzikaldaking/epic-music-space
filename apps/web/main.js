const button = document.querySelector('#toggle-widget');
const widget = document.querySelector('#status-widget');

const toggle = () => {
  const show = widget.hidden;
  widget.hidden = !show;
  button.textContent = show ? 'hide_widget' : 'show_widget';
};

button?.addEventListener('click', () => {
  if (document.startViewTransition) {
    document.startViewTransition(toggle);
  } else {
    toggle();
  }
});
