let timer;
export function dismissNotice() {
  clearTimeout(timer);
  document.getElementById("notification").hidden = true;
}
export function notify(message, error = false) {
  dismissNotice();
  const element = document.getElementById("notification");
  element.textContent = message;
  element.classList.toggle("error", error);
  element.hidden = false;
  timer = setTimeout(dismissNotice, error ? 10000 : 5000);
}
