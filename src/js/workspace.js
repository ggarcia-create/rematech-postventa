import { CLOUD_MODE } from "./config.js";
import { notify, dismissNotice } from "./notice.js";
import { caseDetailHTML, updateCaseControls } from "./case-view.js";
import "../styles/workflow.css";
import { auth } from "./auth.js";
import { cases, localCases } from "./case-storage.js";
import {
  can,
  ROLES,
  PERMISSIONS,
  defaultPermissions,
  STATUSES,
  matchesCase,
} from "./workflow.js";
import { escapeHTML as e, displayDate } from "./utils.js";
import { generatePDF, savePDF } from "./pdf.js";

const $ = (selector) => document.querySelector(selector);
let route = "ingresos",
  records = [],
  selected = null,
  caseImages = [],
  intakeSource,
  busy = false;
const stamp = (value) =>
  new Date(value).toLocaleString("es-MX", {
    dateStyle: "medium",
    timeStyle: "short",
  });
const badge = (status) =>
  `<span class="status-badge ${status}">${STATUSES[status]}</span>`;
const errorText = (id, error) => {
  $(id).textContent = error.message || String(error);
};
function clearImages() {
  caseImages.forEach((url) => url && URL.revokeObjectURL(url));
  caseImages = [];
}
function closeCase() {
  $("#case-dialog").close();
  clearImages();
  selected = null;
}
function defaultRoute() {
  const preferred =
    auth.user().role === "reparacion"
      ? "recepciones"
      : auth.user().role === "calidad"
        ? "calidad"
        : "ingresos";
  return [preferred, "dashboard", "ingresos", "recepciones", "calidad"].find(
    (key) => can(auth.user(), key === "recepciones" ? "reparacion" : key),
  );
}
function requireNewPassword() {
  const dialog = $("#password-change-dialog");
  $("#password-change-form").reset();
  $("#password-change-error").textContent = "";
  $("#login-password").value = "";
  dialog.showModal();
  return new Promise((resolve, reject) => {
    dialog.oncancel = (event) => event.preventDefault();
    $("#cancel-password-change").onclick = () => {
      auth.logout();
      dialog.close();
      reject(new Error("Cambio cancelado. Inicia sesión para continuar."));
    };
    $("#password-change-form").onsubmit = async (event) => {
      event.preventDefault();
      const button = event.submitter;
      button.disabled = true;
      try {
        await auth.changeTemporaryPassword(
          $("#new-account-password").value,
          $("#confirm-account-password").value,
        );
        dialog.close();
        resolve();
      } catch (error) {
        errorText("#password-change-error", error);
      } finally {
        button.disabled = false;
      }
    };
  });
}
async function signIn() {
  $("#application").hidden = true;
  $("#login-screen").hidden = false;
  $("#login-submit").disabled = true;
  const first = !(await auth.hasUsers());
  $("#setup-name-label").hidden = !first;
  $("#open-recovery").hidden = first || CLOUD_MODE;
  $("#account-guidance").hidden = first;
  $("#account-guidance").textContent = CLOUD_MODE
    ? "Si olvidaste tu contraseña, solicita al administrador una temporal."
    : "Hay cuentas registradas en este equipo.";
  $("#login-name").required = first;
  $("#login-title").textContent = first
    ? "Configura tu espacio de trabajo"
    : "Iniciar sesión";
  $("#login-description").textContent = first
    ? "Crea la cuenta administradora. Después podrás dar de alta al equipo de cada área."
    : "Accede con tu cuenta de trabajo.";
  $("#login-submit").textContent = first
    ? "Crear administrador"
    : "Iniciar sesión";
  $("#login-password").autocomplete = first
    ? "new-password"
    : "current-password";
  $("#login-error").textContent = "";
  $("#login-submit").disabled = false;
  await new Promise((resolve) => {
    $("#login-form").onsubmit = async (event) => {
      event.preventDefault();
      const button = $("#login-submit");
      button.disabled = true;
      try {
        if (first)
          await auth.create(
            {
              name: $("#login-name").value,
              email: $("#login-email").value,
              password: $("#login-password").value,
              role: "admin",
            },
            true,
          );
        else {
          const account = await auth.login(
            $("#login-email").value,
            $("#login-password").value,
          );
          if (account.mustChangePassword) await requireNewPassword();
        }
        $("#login-password").value = "";
        $("#login-error").textContent = "";
        $("#login-screen").hidden = true;
        $("#application").hidden = false;
        const user = auth.user();
        $("#session-user").innerHTML =
          `${e(user.name)}<span>${ROLES[user.role]}</span>`;
        $("#manage-users").hidden = user.role !== "admin";
        document.querySelectorAll("[data-route]").forEach((button) => {
          button.disabled = !can(
            user,
            button.dataset.route === "recepciones"
              ? "reparacion"
              : button.dataset.route,
          );
        });
        $("#manual-sales-grid")
          ?.querySelectorAll("input")
          .forEach((input) => (input.disabled = user.role !== "admin"));
        await navigate(defaultRoute());
        await refreshNotifications();
        resolve();
      } catch (error) {
        errorText("#login-error", error);
      } finally {
        button.disabled = false;
      }
    };
  });
}
async function navigate(next) {
  if (!auth.user()) return;
  if (next && !can(auth.user(), next === "recepciones" ? "reparacion" : next))
    return;
  dismissNotice();
  route = next;
  document
    .querySelectorAll("[data-view]")
    .forEach((view) => (view.hidden = view.dataset.view !== route));
  document.querySelectorAll("[data-route]").forEach((button) => {
    button.classList.toggle("active", button.dataset.route === route);
    if (button.dataset.route === route)
      button.setAttribute("aria-current", "page");
    else button.removeAttribute("aria-current");
  });
  if (["recepciones", "calidad"].includes(route)) await refresh();
}
async function refresh() {
  if (!auth.user()) return;
  await refreshNotifications();
  try {
    records = await cases.list();
    renderLists();
  } catch (error) {
    const target = route === "calidad" ? "#quality-list" : "#repair-list";
    $(target).innerHTML =
      `<div class="empty-state"><p>${e(error.message)}</p></div>`;
  }
}
function renderList(area) {
  const quality = area === "quality";
  const query = $(`#${area}-search`).value;
  const status = $(`#${area}-filter`).value;
  const data = records.filter(
    (r) =>
      (!quality || ["calidad", "finalizado"].includes(r.status)) &&
      (!status || r.status === status) &&
      matchesCase(r, query),
  );
  $(`#${area}-list`).innerHTML = data.length
    ? `<div class="case-count">${data.length} expediente${data.length === 1 ? "" : "s"}</div><table class="case-table"><thead><tr><th>Folio / Cliente</th><th>Equipo / S/N</th><th>Pedido</th><th>Estado</th><th></th></tr></thead><tbody>${data.map((r) => `<tr><td><strong>${e(r.intake.folio)}</strong><small>${e(r.intake.client)}</small></td><td>${e(r.intake.equipment)}<small>S/N: ${e(r.intake.serial)}</small></td><td>${e(r.intake.order || "—")}</td><td>${badge(r.status)}</td><td><button data-open-case="${r.id}">Abrir expediente</button></td></tr>`).join("")}</tbody></table>`
    : `<div class="empty-state"><div class="empty-icon">${quality ? "✓" : "▤"}</div><h2>${query ? "Sin coincidencias" : quality ? "No hay equipos en esta bandeja" : "No hay ingresos en esta consulta"}</h2><p>${query ? "Prueba con el folio, número de pedido o número de serie." : quality ? "Los equipos aparecerán aquí cuando Reparación los envíe a Calidad." : "Registra un ingreso para iniciar el seguimiento del equipo."}</p></div>`;
}
function renderLists() {
  renderList("repair");
  renderList("quality");
}
function detail() {
  clearImages();
  caseImages = selected.evidence.map((blob) =>
    blob ? URL.createObjectURL(blob) : null,
  );
  $("#case-title").textContent = selected.intake.folio;
  $("#case-detail").innerHTML = caseDetailHTML(
    selected,
    auth.user(),
    caseImages,
  );
  updateCaseControls($("#case-detail"));
}
async function openCase(id) {
  try {
    selected = await cases.get(id);
    if (!selected) throw new Error("El expediente ya no está disponible.");
    $("#case-message").textContent = "";
    detail();
    $("#case-dialog").showModal();
    $("#case-dialog").scrollTop = 0;
  } catch (error) {
    notify(error.message, true);
  }
}
async function act(action) {
  if (busy || !selected || !auth.user()) return;
  busy = true;
  $("#case-dialog")
    .querySelectorAll("button")
    .forEach((button) => (button.disabled = true));
  try {
    if (action === "pdf") {
      const blob = await generatePDF(
        {
          ...selected.intake,
          technical: selected.technical,
          quality: selected.quality,
          qualityReviews: selected.qualityReviews,
          comments: selected.comments,
        },
        "repair",
        selected.evidence,
      );
      await savePDF(blob, "repair", selected.intake.folio);
      return;
    }
    let payload = {};
    if (["save-technical", "send-quality", "notify-admin"].includes(action)) {
      const data = new FormData($("#technical-form"));
      payload = Object.fromEntries(data);
      payload.faultLocations = data.getAll("faultLocations");
    }
    if (["finish", "return-repair"].includes(action))
      payload = Object.fromEntries(new FormData($("#quality-form")));
    if (action === "add-comment")
      payload = Object.fromEntries(new FormData($("#comment-form")));
    if (action === "update-return")
      payload = Object.fromEntries(new FormData($("#return-form")));
    if (action === "update-intake")
      payload = Object.fromEntries(new FormData($("#admin-intake-form")));
    const drafts =
      action === "add-comment"
        ? [
            ...$("#case-detail").querySelectorAll(
              "#technical-form input:not(:disabled), #technical-form textarea:not(:disabled), #technical-form select:not(:disabled), #quality-form input:not(:disabled), #quality-form textarea:not(:disabled)",
            ),
          ].map((input) => ({
            form: input.form.id,
            name: input.name,
            value: input.value,
            checked: input.checked,
            type: input.type,
          }))
        : [];
    selected = await cases.act(
      selected.id,
      selected.revision,
      action,
      payload,
      auth.user(),
    );
    detail();
    for (const data of drafts) {
      for (const input of document.getElementById(data.form)?.elements || []) {
        if (input.name !== data.name) continue;
        if (data.type === "checkbox" || data.type === "radio") {
          if (input.value === data.value) input.checked = data.checked;
        } else input.value = data.value;
      }
    }
    updateCaseControls($("#case-detail"));
    $("#case-message").classList.remove("error");
    $("#case-message").textContent = {
      receive:
        "Recepción registrada. Ya puedes capturar la información técnica.",
      "send-quality":
        "Calidad notificada. La etapa de Reparación quedó cerrada.",
      "notify-admin":
        "Administrador notificado. El comentario quedó guardado en el expediente.",
      "add-comment": "Comentario publicado. Reparación fue notificada.",
      finish: "Inspección aprobada. Proceso finalizado.",
      "return-repair":
        "Equipo devuelto a Reparación. Se notificó a Reparación y al administrador.",
      "save-technical": "Información técnica guardada.",
      "update-return":
        "Estado de devolución actualizado y agregado al historial.",
      "update-intake": "Datos del expediente actualizados.",
    }[action];
    await refresh();
  } catch (error) {
    $("#case-message").classList.add("error");
    errorText("#case-message", error);
  } finally {
    busy = false;
    $("#case-dialog")
      .querySelectorAll("button")
      .forEach((button) => (button.disabled = false));
  }
}
async function refreshNotifications() {
  const user = auth.user();
  if (!user) return;
  try {
    const notes = await cases.notifications(user);
    if (auth.user()?.id !== user.id) return;
    const count = notes.filter((n) => n.unread).length;
    $("#notification-count").textContent = String(count);
    $("#open-notifications").setAttribute(
      "aria-label",
      `Notificaciones: ${count} sin leer`,
    );
    $("#notifications-list").innerHTML = notes.length
      ? notes
          .map(
            (n) =>
              `<button class="notification-item ${n.unread ? "unread" : ""}" data-note="${n.id}" data-case="${n.caseId}"><strong>${e(n.folio)}</strong><span>${e(n.action)}</span><small>${e(n.actor)} · ${e(stamp(n.at))} · ${n.unread ? "Sin leer" : "Leída"}</small></button>`,
          )
          .join("")
      : '<div class="empty-state"><h2>Sin notificaciones</h2><p>Los avisos dirigidos a tu área aparecerán aquí.</p></div>';
    $("#notifications-error").textContent = "";
  } catch (error) {
    $("#notifications-error").textContent = error.message;
  }
}
async function showUsers(onlyUserId) {
  $("#open-local-import").hidden = !CLOUD_MODE;
  const list = await auth.users();
  const html = list
    .filter((u) => !onlyUserId || u.id === onlyUserId)
    .map(
      (u) =>
        `<div class="user-row"><div class="user-identity"><strong>${e(u.name)}</strong><small>${e(u.email)}</small><small>${u.mustChangePassword ? "Cambio de contraseña pendiente" : "Cuenta activa"}</small></div><div class="user-access"><select aria-label="Rol de ${e(u.name)}" data-user-role="${u.id}" ${u.id === auth.user().id ? "disabled" : ""}>${Object.entries(
          ROLES,
        )
          .map(
            ([key, label]) =>
              `<option value="${key}" ${key === u.role ? "selected" : ""}>${label}</option>`,
          )
          .join("")}</select>${
          u.role === "admin"
            ? "<small>Acceso completo · administración de usuarios</small>"
            : `<div class="permission-toggles" role="group" aria-label="Permisos de ${e(u.name)}">${Object.entries(
                PERMISSIONS,
              )
                .map(
                  ([key, label]) =>
                    `<label><input type="checkbox" data-user-permission="${u.id}" value="${key}" ${(u.permissions ?? defaultPermissions(u.role)).includes(key) ? "checked" : ""}><span>${label}</span></label>`,
                )
                .join(
                  "",
                )}</div><button type="button" data-save-permissions="${u.id}" class="primary" disabled>Guardar permisos</button>`
        }<p class="user-access-status" role="status" aria-live="polite"></p>${CLOUD_MODE && u.id !== auth.user().id ? `<button class="reset-user" type="button" data-reset-user="${u.id}">Restablecer contraseña</button>` : ""}</div></div>`,
    )
    .join("");
  if (onlyUserId) {
    const row = [...document.querySelectorAll("[data-user-role]")]
      .find((el) => el.dataset.userRole === onlyUserId)
      ?.closest(".user-row");
    if (row) row.outerHTML = html;
  } else $("#users-list").innerHTML = html;
}
export async function initializeWorkspace(source) {
  intakeSource = source;
  $("#open-notifications").addEventListener("click", async () => {
    await refreshNotifications();
    $("#notifications-dialog").showModal();
  });
  $("#close-notifications").addEventListener("click", () =>
    $("#notifications-dialog").close(),
  );
  $("#notifications-list").addEventListener("click", async (event) => {
    const button = event.target.closest("[data-note]");
    if (!button) return;
    button.disabled = true;
    try {
      await cases.markNotificationRead(
        button.dataset.case,
        button.dataset.note,
        auth.user(),
      );
      $("#notifications-dialog").close();
      await openCase(button.dataset.case);
      await refreshNotifications();
    } catch (error) {
      $("#notifications-error").textContent = error.message;
      button.disabled = false;
    }
  });

  let recovering = false;
  $("#open-recovery").addEventListener("click", () => {
    $("#recovery-form").reset();
    $("#recovery-email").value = $("#login-email").value;
    $("#recovery-message").textContent = "";
    $("#recovery-dialog").showModal();
  });
  $("#cancel-recovery").addEventListener("click", () => {
    if (!recovering) $("#recovery-dialog").close();
  });
  $("#recovery-dialog").addEventListener("cancel", (event) => {
    if (recovering) event.preventDefault();
  });
  $("#recovery-dialog").addEventListener("close", () =>
    $("#recovery-form").reset(),
  );
  $("#recovery-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    if (recovering) return;
    recovering = true;
    $("#submit-recovery").disabled = true;
    $("#cancel-recovery").disabled = true;
    try {
      const email = $("#recovery-email").value.trim();
      await auth.resetPassword(
        email,
        $("#recovery-password").value,
        $("#recovery-confirmation").value,
        $("#recovery-code").value,
      );
      $("#recovery-dialog").close();
      $("#login-email").value = email;
      $("#login-password").value = "";
      $("#login-error").textContent =
        "Contraseña actualizada. Inicia sesión con tu nueva contraseña.";
      $("#login-password").focus();
    } catch (error) {
      errorText("#recovery-message", error);
    } finally {
      recovering = false;
      $("#submit-recovery").disabled = false;
      $("#cancel-recovery").disabled = false;
    }
  });

  document
    .querySelectorAll("[data-route]")
    .forEach((button) =>
      button.addEventListener("click", () => navigate(button.dataset.route)),
    );
  document
    .querySelectorAll(".refresh-cases")
    .forEach((button) => button.addEventListener("click", refresh));
  for (const area of ["repair", "quality"]) {
    $(`#${area}-search`).addEventListener("input", () => renderList(area));
    $(`#${area}-filter`).addEventListener("change", () => renderList(area));
    $(`#${area}-list`).addEventListener("click", (event) => {
      const button = event.target.closest("[data-open-case]");
      if (button) openCase(button.dataset.openCase);
    });
  }
  $("#close-case").addEventListener("click", () => {
    if (!busy) closeCase();
  });
  $("#case-dialog").addEventListener("cancel", (event) => {
    if (busy) event.preventDefault();
    else {
      clearImages();
      selected = null;
    }
  });
  $("#case-detail").addEventListener("click", (event) => {
    const button = event.target.closest("[data-case-action]");
    if (button) act(button.dataset.caseAction);
  });
  $("#case-detail").addEventListener("change", (event) => {
    if (event.target.name === "faultLocations" && event.target.checked) {
      const special = ["Sin falla detectada", "Por determinar"];
      for (const input of $("#technical-form").querySelectorAll(
        '[name="faultLocations"]',
      ))
        if (
          input !== event.target &&
          (special.includes(event.target.value) ||
            special.includes(input.value))
        )
          input.checked = false;
    }
    updateCaseControls($("#case-detail"));
  });
  $("#case-detail").addEventListener("submit", (event) =>
    event.preventDefault(),
  );
  $("#register-intake").addEventListener("click", async () => {
    const button = $("#register-intake");
    button.disabled = true;
    try {
      const { draft, evidence } = intakeSource();
      await cases.register(draft, evidence, auth.user());
      $("#repair-search").value = "";
      $("#repair-filter").value = "";
      await refresh();
      notify(
        `Ingreso ${draft.folio} registrado y enviado a Reparación. La requisición ya está disponible en su expediente.`,
      );
    } catch (error) {
      notify(error.message, true);
    } finally {
      button.disabled = false;
    }
  });
  $("#logout").addEventListener("click", async () => {
    document
      .querySelectorAll("dialog[open]")
      .forEach((dialog) => dialog.close());
    clearImages();
    selected = null;
    records = [];
    $("#notifications-list").innerHTML = "";
    $("#notification-count").textContent = "0";
    $("#repair-list").innerHTML = "";
    $("#quality-list").innerHTML = "";
    dismissNotice();
    $("#repair-search").value = "";
    $("#repair-filter").value = "";
    $("#quality-search").value = "";
    $("#quality-filter").value = "calidad";
    auth.logout();
    await signIn();
  });
  $("#manage-users").addEventListener("click", async () => {
    try {
      await showUsers();
      $("#user-message").textContent = "";
      $("#users-dialog").showModal();
    } catch (error) {
      notify(error.message, true);
    }
  });
  $("#open-local-import").addEventListener("click", async () => {
    try {
      const local = await localCases.list();
      $("#local-import-message").textContent =
        `${local.length} expedientes en esta computadora. Se copiarán al espacio compartido; los originales se conservan y no se reemplazan expedientes existentes.`;
      $("#confirm-local-import").disabled = local.length === 0;
      $("#local-import-dialog").showModal();
    } catch (error) {
      errorText("#user-message", error);
    }
  });
  $("#cancel-local-import").addEventListener("click", () =>
    $("#local-import-dialog").close(),
  );
  $("#local-import-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const button = event.submitter;
    button.disabled = true;
    $("#cancel-local-import").disabled = true;
    let transferred = 0,
      skipped = 0;
    try {
      const local = await localCases.list();
      for (const record of local) {
        $("#local-import-message").textContent =
          `Transfiriendo ${transferred + skipped + 1} de ${local.length}…`;
        const result = await cases.importLocal(record);
        if (result.skipped) skipped++;
        else transferred++;
      }
      $("#local-import-message").textContent =
        `${transferred} transferidos; ${skipped} ya estaban en el espacio compartido. La copia local se conserva.`;
      await refresh();
    } catch (error) {
      $("#local-import-message").textContent =
        `${transferred} transferidos. ${error.message} Puedes volver a intentar; no se duplicarán los ya transferidos.`;
      button.disabled = false;
    } finally {
      $("#cancel-local-import").disabled = false;
    }
  });
  $("#local-import-dialog").addEventListener("cancel", (event) => {
    if ($("#cancel-local-import").disabled) event.preventDefault();
  });
  $("#users-list").addEventListener("click", (event) => {
    const button = event.target.closest("[data-reset-user]");
    if (!button) return;
    $("#reset-user-form").reset();
    $("#reset-user-form").dataset.userId = button.dataset.resetUser;
    $("#reset-user-error").textContent = "";
    $("#reset-user-dialog").showModal();
  });
  $("#cancel-reset-user").addEventListener("click", () =>
    $("#reset-user-dialog").close(),
  );
  $("#reset-user-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    event.submitter.disabled = true;
    try {
      await auth.resetUserPassword(
        event.target.dataset.userId,
        $("#reset-user-password").value,
      );
      event.target.reset();
      $("#reset-user-dialog").close();
      await showUsers();
      $("#user-message").textContent =
        "Contraseña temporal actualizada. El usuario deberá cambiarla al entrar.";
    } catch (error) {
      errorText("#reset-user-error", error);
    } finally {
      event.submitter.disabled = false;
    }
  });
  $("#users-list").addEventListener("change", async (event) => {
    if (!event.target.matches("[data-user-role]")) return;
    event.target.disabled = true;
    try {
      await auth.setRole(event.target.dataset.userRole, event.target.value);
      await showUsers(event.target.dataset.userRole);
      const row = [...document.querySelectorAll("[data-user-role]")]
        .find((el) => el.dataset.userRole === event.target.dataset.userRole)
        .closest(".user-row");
      row.querySelector(".user-access-status").textContent =
        "Rol guardado. Se aplicará al volver a iniciar sesión.";
      event.target.disabled = false;
      $("#user-message").textContent =
        "Rol actualizado. Se aplicará en el próximo inicio de sesión.";
    } catch (error) {
      errorText("#user-message", error);
      event.target.disabled = false;
    }
  });
  $("#users-list").addEventListener("change", (event) => {
    if (!event.target.matches("[data-user-permission]")) return;
    const row = event.target.closest(".user-row");
    row.querySelector("[data-save-permissions]").disabled = false;
    row.querySelector(".user-access-status").textContent =
      "Cambios sin guardar";
  });
  $("#users-list").addEventListener("click", async (event) => {
    const button = event.target.closest("[data-save-permissions]");
    if (!button || button.disabled) return;
    const row = button.closest(".user-row");
    const inputs = [...row.querySelectorAll("[data-user-permission]")];
    const role = row.querySelector("[data-user-role]");
    const status = row.querySelector(".user-access-status");
    const permissions = inputs
      .filter((input) => input.checked)
      .map((input) => input.value);
    button.disabled = true;
    role.disabled = true;
    inputs.forEach((input) => (input.disabled = true));
    status.textContent = "Guardando…";
    try {
      await auth.setPermissions(button.dataset.savePermissions, permissions);
      status.textContent =
        "Permisos guardados. Se aplicarán al volver a iniciar sesión.";
    } catch (error) {
      status.textContent = `No se guardaron: ${error.message}. Conservamos tu selección; vuelve a intentar.`;
      button.disabled = false;
    } finally {
      role.disabled = false;
      inputs.forEach((input) => (input.disabled = false));
    }
  });
  $("#close-users").addEventListener("click", () => $("#users-dialog").close());
  $('#user-form [name="role"]').addEventListener("change", (event) => {
    const defaults = defaultPermissions(event.target.value);
    document
      .querySelectorAll('#user-form [name="permissions"]')
      .forEach((input) => {
        input.checked = defaults.includes(input.value);
      });
  });
  $("#user-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const button = event.submitter;
    button.disabled = true;
    try {
      const formData = new FormData(event.target);
      await auth.create({
        ...Object.fromEntries(formData),
        permissions: formData.getAll("permissions"),
        temporary: true,
      });
      event.target.reset();
      await showUsers();
      $("#user-message").textContent = CLOUD_MODE
        ? "Usuario creado. Puede entrar desde cualquier computadora conectada."
        : "Usuario creado. Puede iniciar sesión en esta computadora.";
    } catch (error) {
      errorText("#user-message", error);
    } finally {
      button.disabled = false;
    }
  });
  window.addEventListener("focus", () => {
    if (auth.user() && !$("#case-dialog").open) refresh();
  });
  setInterval(() => {
    if (auth.user()) {
      if (["recepciones", "calidad"].includes(route) && !$("#case-dialog").open)
        refresh();
      else refreshNotifications();
    }
  }, 10000);
  await signIn();
}
