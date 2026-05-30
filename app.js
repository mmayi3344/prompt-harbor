// ===== Prompt Harbor - App Logic =====
const STORAGE_KEY = "prompt-harbor-data";

function migratePrompt(p) {
  if (!p.versions) {
    p.versions = [{ versionLabel: "v1", raw: p.raw || "", createdAt: p.createdAt || Date.now() }];
  }
  if (!p.createdAt) {
    var firstVer = p.versions[0];
    p.createdAt = firstVer ? firstVer.createdAt : Date.now();
  }
  if (!p.updatedAt) {
    var lastVer = p.versions[p.versions.length - 1];
    p.updatedAt = lastVer ? lastVer.createdAt : Date.now();
  }
  return p;
}

function loadPrompts() {
  try { const raw = localStorage.getItem(STORAGE_KEY); return raw ? JSON.parse(raw).map(migratePrompt) : []; }
  catch { return []; }
}

function savePrompts(prompts) { localStorage.setItem(STORAGE_KEY, JSON.stringify(prompts)); }
function genId() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }

let prompts = loadPrompts();
let editingId = null;
let editingVersionIdx = -1;
let activeTagFilter = null;

const $ = (s) => document.querySelector(s);
const cardGrid = $("#cardGrid");
const emptyState = $("#emptyState");
const searchInput = $("#searchInput");
const tagFilters = $("#tagFilters");
const resultCount = $("#resultCount");
const toast = $("#toast");
const modalOverlay = $("#modalOverlay");
const modalTitle = $("#modalTitle");
const modalDeleteBtn = $("#modalDelete");
const editTitle = $("#editTitle");
const editDescription = $("#editDescription");
const editCollection = $("#editCollection");
const editModel = $("#editModel");
const editTags = $("#editTags");
const editVersionLabel = $("#editVersionLabel");
const editRaw = $("#editRaw");
const versionSelector = $("#versionSelector");
const addVersionBtn = $("#addVersionBtn");
const deleteVersionBtn = $("#deleteVersionBtn");
const previewOverlay = $("#previewOverlay");
const importFile = $("#importFile");

let toastTimer;
function showToast(msg) {
  clearTimeout(toastTimer);
  toast.textContent = msg; toast.classList.add("show");
  toastTimer = setTimeout(function() { toast.classList.remove("show"); }, 2000);
}

// ===== Render =====
function getAllTags() {
  var set = new Set();
  prompts.forEach(function(p) { if (p.tags) p.tags.forEach(function(t) { if (t) set.add(t); }); });
  return Array.from(set).sort();
}

function renderTagFilters() {
  var tags = getAllTags();
  tagFilters.innerHTML = tags.map(function(t) {
    return '<button class="filter-chip' + (activeTagFilter === t ? ' active' : '') + '" data-tag="' + t + '">' + t + '</button>';
  }).join("");
  tagFilters.querySelectorAll(".filter-chip").forEach(function(btn) {
    btn.addEventListener("click", function() {
      activeTagFilter = activeTagFilter === btn.dataset.tag ? null : btn.dataset.tag;
      renderAll();
    });
  });
}

function getFilteredPrompts() {
  var q = searchInput.value.toLowerCase().trim();
  return prompts.filter(function(p) {
    if (activeTagFilter && (!p.tags || p.tags.indexOf(activeTagFilter) === -1)) return false;
    if (!q) return true;
    return (p.title || "").toLowerCase().indexOf(q) !== -1 ||
      (p.description || "").toLowerCase().indexOf(q) !== -1 ||
      (p.collection || "").toLowerCase().indexOf(q) !== -1 ||
      (p.model || "").toLowerCase().indexOf(q) !== -1 ||
      p.versions.some(function(v) { return v.raw.toLowerCase().indexOf(q) !== -1; }) ||
      (p.tags || []).some(function(t) { return t.toLowerCase().indexOf(q) !== -1; });
  });
}

function fmtTime(ts) {
  if (!ts) return "";
  var d = new Date(ts);
  var m = d.getMonth() + 1;
  var day = d.getDate();
  return d.getFullYear() + "-" + (m < 10 ? "0" : "") + m + "-" + (day < 10 ? "0" : "") + day;
}

function renderCards() {
  var filtered = getFilteredPrompts();
  cardGrid.innerHTML = filtered.map(function(p) {
    var versions = p.versions;
    var lastVer = versions[versions.length - 1];
    var verCount = versions.length;

    var verPills = '<span class="card-ver-pill">' + escHtml(lastVer.versionLabel) + '</span>';
    if (verCount > 1) {
      verPills += '<span class="card-ver-count">+' + (verCount - 1) + '</span>';
    }

    var tagHtml = (p.tags || []).map(function(t) {
      return '<span class="card-tag">' + escHtml(t) + '</span>';
    }).join("");

    var desc = p.description || "";
    var created = p.createdAt ? fmtTime(p.createdAt) : "";
    var updated = p.updatedAt ? fmtTime(p.updatedAt) : "";

    return '<div class="prompt-card" data-id="' + p.id + '">' +
      '<div class="card-face">' +
      '<div class="card-chrome"><span class="chrome-dot dot-red"></span><span class="chrome-dot dot-amber"></span><span class="chrome-dot dot-green"></span></div>' +
      '<div class="card-title">' + escHtml(p.title || "Untitled") + '</div>' +
      (desc ? '<div class="card-desc">' + escHtml(desc) + '</div>' : '') +
      '<div class="card-meta-row">' +
      (created ? '<span class="card-meta">Created ' + created + '</span>' : '') +
      '<span class="card-meta card-meta-model">' + escHtml(p.model || "") + '</span>' +
      '</div>' +
      '<div class="card-footer">' + verPills + tagHtml + '<span class="card-collection">' + escHtml(p.collection || "") + '</span></div>' +
      '<div class="card-actions">' +
      '<button class="card-action-btn" data-action="edit" data-id="' + p.id + '">Edit</button>' +
      '<button class="card-action-btn" data-action="newver" data-id="' + p.id + '">+ Version</button>' +
      '<button class="card-action-btn danger" data-action="delete" data-id="' + p.id + '">Delete</button>' +
      '</div></div></div>';
  }).join("");

  cardGrid.querySelectorAll(".prompt-card").forEach(function(card) {
    card.addEventListener("mousemove", function(e) {
      var rect = card.getBoundingClientRect();
      card.style.setProperty("--mouse-x", ((e.clientX - rect.left) / rect.width) * 100 + "%");
      card.style.setProperty("--mouse-y", ((e.clientY - rect.top) / rect.height) * 100 + "%");
    });
    card.addEventListener("click", function(e) {
      if (e.target.closest(".card-action-btn")) return;
      showPreview(card.dataset.id);
    });
  });

  cardGrid.querySelectorAll(".card-action-btn[data-action='edit']").forEach(function(btn) {
    btn.addEventListener("click", function(e) { e.stopPropagation(); openEditor(btn.dataset.id); });
  });
  cardGrid.querySelectorAll(".card-action-btn[data-action='newver']").forEach(function(btn) {
    btn.addEventListener("click", function(e) { e.stopPropagation(); openNewVersion(btn.dataset.id); });
  });
  cardGrid.querySelectorAll(".card-action-btn[data-action='delete']").forEach(function(btn) {
    btn.addEventListener("click", function(e) { e.stopPropagation(); deletePrompt(btn.dataset.id); });
  });

  emptyState.classList.toggle("hidden", filtered.length > 0);
  resultCount.textContent = filtered.length + " prompts";
}

function renderAll() { renderTagFilters(); renderCards(); }

function escHtml(s) { var d = document.createElement("div"); d.textContent = s; return d.innerHTML; }

// ===== Preview =====
let previewId = null;
let previewVerIdx = null;

function showPreview(id, verIdx) {
  var p = prompts.find(function(x) { return x.id === id; });
  if (!p) return;
  previewId = id;
  previewVerIdx = (verIdx != null && p.versions[verIdx]) ? verIdx : p.versions.length - 1;
  var targetVer = p.versions[previewVerIdx];

  $("#previewLabel").textContent = targetVer.versionLabel;
  $("#previewCollection").textContent = p.collection || "";
  $("#previewModel").textContent = p.model || "";
  $("#previewTitle").textContent = p.title || "Untitled";
  $("#previewTags").innerHTML = (p.tags || []).map(function(t) {
    return '<span class="preview-tag">' + escHtml(t) + '</span>';
  }).join("");

  $("#previewVersionTabs").innerHTML = p.versions.map(function(v, i) {
    return '<button class="preview-version-tab' + (i === previewVerIdx ? ' active' : '') + '" data-idx="' + i + '">' + escHtml(v.versionLabel) + '</button>';
  }).join("");

  $("#previewVersionTabs").querySelectorAll(".preview-version-tab").forEach(function(tab) {
    tab.addEventListener("click", function() {
      var idx = parseInt(tab.dataset.idx);
      var v2 = p.versions[idx];
      if (!v2) return;
      $("#previewVersionTabs").querySelectorAll(".preview-version-tab").forEach(function(t) { t.classList.remove("active"); });
      tab.classList.add("active");
      previewVerIdx = idx;
      $("#previewContent").textContent = v2.raw;
      $("#previewLabel").textContent = v2.versionLabel;
      updatePreviewDeleteBtn(p);
    });
  });

  $("#previewContent").textContent = targetVer.raw;
  updatePreviewDeleteBtn(p);
  previewOverlay.classList.add("active");
}

function updatePreviewDeleteBtn(p) {
  var btn = $("#previewDeleteVer");
  if (!btn) return;
  btn.style.display = p.versions.length > 1 ? "inline-flex" : "none";
}

function hidePreview() { previewOverlay.classList.remove("active"); previewId = null; previewVerIdx = null; }
previewOverlay.addEventListener("click", function(e) { if (e.target === previewOverlay) hidePreview(); });

previewOverlay.addEventListener("click", function(e) {
  var btn = e.target.closest("button");
  if (!btn) return;
  if (btn.id === "previewCopy") {
    var p = prompts.find(function(x) { return x.id === previewId; });
    if (!p || previewVerIdx == null) return;
    var v = p.versions[previewVerIdx];
    if (!v) return;
    navigator.clipboard.writeText(v.raw).then(function() { showToast("Copied"); });
  } else if (btn.id === "previewEdit") {
    if (!previewId) return;
    var selIdx = previewVerIdx;
    var pid = previewId;
    hidePreview();
    openEditorAtVersion(pid, selIdx);
  } else if (btn.id === "previewDeleteVer") {
    var p2 = prompts.find(function(x) { return x.id === previewId; });
    if (!p2 || p2.versions.length <= 1) { showToast("Cannot delete the only version"); return; }
    if (previewVerIdx == null || !p2.versions[previewVerIdx]) return;
    var v2 = p2.versions[previewVerIdx];
    if (!confirm('Delete version "' + v2.versionLabel + '"?')) return;
    p2.versions.splice(previewVerIdx, 1);
    savePrompts(prompts);
    showToast("Deleted " + v2.versionLabel);
    renderAll();
    if (p2.versions.length === 0) { hidePreview(); return; }
    previewVerIdx = Math.min(previewVerIdx, p2.versions.length - 1);
    showPreview(p2.id, previewVerIdx);
  }
});

document.addEventListener("keydown", function(e) { if (e.key === "Escape") hidePreview(); });

// ===== Modal =====
function populateVersionSelector(p) {
  versionSelector.innerHTML = p.versions.map(function(v, i) {
    return '<option value="' + i + '"' + (i === editingVersionIdx ? ' selected' : '') + '>' + escHtml(v.versionLabel) + '</option>';
  }).join("");
}

function loadVersionForm(p, idx) {
  var v = p.versions[idx];
  if (!v) return;
  editingVersionIdx = idx;
  editVersionLabel.value = v.versionLabel;
  editRaw.value = v.raw;
  versionSelector.value = String(idx);
  deleteVersionBtn.style.display = p.versions.length > 1 ? "inline-flex" : "none";
}

function commitCurrentVersion() {
  if (editingId === null || editingVersionIdx < 0) return;
  var p = prompts.find(function(x) { return x.id === editingId; });
  if (!p || !p.versions[editingVersionIdx]) return;
  p.versions[editingVersionIdx].versionLabel = editVersionLabel.value.trim() || "v" + (editingVersionIdx + 1);
  p.versions[editingVersionIdx].raw = editRaw.value;
}

versionSelector.addEventListener("change", function() {
  if (editingId === null) return;
  commitCurrentVersion();
  var p = prompts.find(function(x) { return x.id === editingId; });
  if (!p) return;
  loadVersionForm(p, parseInt(versionSelector.value));
});

addVersionBtn.addEventListener("click", function() {
  if (editingId === null) return;
  commitCurrentVersion();
  var p = prompts.find(function(x) { return x.id === editingId; });
  if (!p) return;
  var newLabel = prompt("Version label:", "v" + (p.versions.length + 1));
  if (!newLabel) return;
  p.versions.push({ versionLabel: newLabel.trim(), raw: "", createdAt: Date.now() });
  editingVersionIdx = p.versions.length - 1;
  populateVersionSelector(p);
  loadVersionForm(p, editingVersionIdx);
});

deleteVersionBtn.addEventListener("click", function() {
  if (editingId === null) return;
  var p = prompts.find(function(x) { return x.id === editingId; });
  if (!p || p.versions.length <= 1) { showToast("Cannot delete the only version"); return; }
  var v = p.versions[editingVersionIdx];
  if (!confirm('Delete version "' + v.versionLabel + '"?')) return;
  p.versions.splice(editingVersionIdx, 1);
  if (editingVersionIdx >= p.versions.length) editingVersionIdx = p.versions.length - 1;
  populateVersionSelector(p);
  loadVersionForm(p, editingVersionIdx);
});

function openNewVersion(id) {
  var p = prompts.find(function(x) { return x.id === id; });
  if (!p) return;
  editingId = id;
  editingVersionIdx = -1;
  modalTitle.textContent = "New Version";
  editTitle.value = p.title || "";
  editDescription.value = p.description || "";
  editCollection.value = p.collection || "";
  editModel.value = p.model || "";
  editTags.value = (p.tags || []).join(", ");
  editVersionLabel.value = "v" + (p.versions.length + 1);
  editRaw.value = "";
  versionSelector.innerHTML = '<option value="0">[New]</option>';
  modalDeleteBtn.style.display = "none";
  addVersionBtn.style.display = "none";
  deleteVersionBtn.style.display = "none";
  modalOverlay.classList.add("active");
  editRaw.focus();
}

function openEditorAtVersion(id, verIdx) {
  var p = prompts.find(function(x) { return x.id === id; });
  if (!p) return;
  editingId = id;
  modalTitle.textContent = "Edit Prompt";
  editTitle.value = p.title || "";
  editDescription.value = p.description || "";
  editCollection.value = p.collection || "";
  editModel.value = p.model || "";
  editTags.value = (p.tags || []).join(", ");
  editingVersionIdx = (verIdx != null && p.versions[verIdx]) ? verIdx : p.versions.length - 1;
  populateVersionSelector(p);
  loadVersionForm(p, editingVersionIdx);
  modalDeleteBtn.style.display = "inline-flex";
  addVersionBtn.style.display = "inline-flex";
  modalOverlay.classList.add("active");
  editTitle.focus();
}

function openEditor(id) {
  if (!id) {
    editingId = null;
    editingVersionIdx = 0;
    modalTitle.textContent = "New Prompt";
    editTitle.value = "";
    editDescription.value = "";
    editCollection.value = "";
    editModel.value = "";
    editTags.value = "";
    editVersionLabel.value = "v1";
    editRaw.value = "";
    versionSelector.innerHTML = '<option value="0">v1</option>';
    modalDeleteBtn.style.display = "none";
    addVersionBtn.style.display = "none";
    deleteVersionBtn.style.display = "none";
    modalOverlay.classList.add("active");
    editTitle.focus();
    return;
  }
  var p = prompts.find(function(x) { return x.id === id; });
  if (!p) return;
  openEditorAtVersion(id, p.versions.length - 1);
}

function closeEditor() { modalOverlay.classList.remove("active"); editingId = null; editingVersionIdx = -1; }

function savePrompt() {
  if (editingVersionIdx >= 0) commitCurrentVersion();
  var title = editTitle.value.trim();
  var desc = editDescription.value.trim();
  var tags = editTags.value.split(/[,，]/).map(function(t) { return t.trim(); }).filter(Boolean);

  if (editingId !== null && editingVersionIdx === -1) {
    var p = prompts.find(function(x) { return x.id === editingId; });
    if (!p) return;
    var raw = editRaw.value.trim();
    var vLabel = editVersionLabel.value.trim() || "v" + (p.versions.length + 1);
    if (!title && !raw && !desc) { showToast("Please fill in at least a title, description or body"); return; }
    p.title = title || "Untitled";
    p.description = desc;
    p.collection = editCollection.value.trim();
    p.model = editModel.value.trim();
    p.tags = tags;
    p.versions.push({ versionLabel: vLabel, raw: raw, createdAt: Date.now() });
    p.updatedAt = Date.now();
    showToast("New version added");
  } else if (editingId) {
    var p2 = prompts.find(function(x) { return x.id === editingId; });
    if (!p2) return;
    var v = p2.versions[editingVersionIdx];
    if (!v) return;
    if (!title && !v.raw.trim() && !desc) { showToast("Please fill in at least a title, description or body"); return; }
    p2.title = title || "Untitled";
    p2.description = desc;
    p2.collection = editCollection.value.trim();
    p2.model = editModel.value.trim();
    p2.tags = tags;
    p2.updatedAt = Date.now();
    showToast("Updated");
  } else {
    var raw2 = editRaw.value.trim();
    var vLabel2 = editVersionLabel.value.trim() || "v1";
    if (!title && !raw2 && !desc) { showToast("Please fill in at least a title, description or body"); return; }
    prompts.unshift({
      id: genId(), title: title || "Untitled", description: desc,
      collection: editCollection.value.trim(), model: editModel.value.trim(), tags: tags,
      versions: [{ versionLabel: vLabel2, raw: raw2, createdAt: Date.now() }],
      createdAt: Date.now(), updatedAt: Date.now()
    });
    showToast("Added");
  }
  savePrompts(prompts);
  closeEditor();
  renderAll();
}

function deletePrompt(id) {
  var p = prompts.find(function(x) { return x.id === id; });
  if (!p) return;
  if (!confirm('Delete "' + (p.title || "Untitled") + '"?')) return;
  prompts = prompts.filter(function(x) { return x.id !== id; });
  savePrompts(prompts);
  if (editingId === id) closeEditor();
  if (previewId === id) hidePreview();
  showToast("Deleted");
  renderAll();
}

$("#addBtn").addEventListener("click", function() { openEditor(null); });
$("#modalClose").addEventListener("click", closeEditor);
$("#modalCancel").addEventListener("click", closeEditor);
$("#modalSave").addEventListener("click", savePrompt);
$("#modalDelete").addEventListener("click", function() { if (editingId) { closeEditor(); deletePrompt(editingId); } });
modalOverlay.addEventListener("click", function(e) { if (e.target === modalOverlay) closeEditor(); });
document.addEventListener("keydown", function(e) { if (e.key === "Escape" && modalOverlay.classList.contains("active")) closeEditor(); });
searchInput.addEventListener("input", function() { renderCards(); });

$("#exportBtn").addEventListener("click", function() {
  if (prompts.length === 0) { showToast("Nothing to export"); return; }
  var blob = new Blob([JSON.stringify(prompts, null, 2)], { type: "application/json" });
  var a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "prompt-harbor-" + new Date().toISOString().slice(0, 10) + ".json";
  a.click();
  URL.revokeObjectURL(a.href);
  showToast("Exported");
});

$("#importBtn").addEventListener("click", function() { importFile.click(); });
importFile.addEventListener("change", function() {
  var file = importFile.files[0];
  if (!file) return;
  var reader = new FileReader();
  reader.onload = function() {
    try {
      var data = JSON.parse(reader.result);
      if (!Array.isArray(data)) throw new Error("Invalid format");
      var merged = data.map(migratePrompt).concat(prompts);
      var seen = {};
      prompts = [];
      for (var i = 0; i < merged.length; i++) {
        var item = merged[i];
        if (!item.id) item.id = genId();
        if (!seen[item.id]) { seen[item.id] = true; prompts.push(item); }
      }
      savePrompts(prompts);
      showToast("Imported " + data.length + " prompts");
      renderAll();
    } catch (ex) { showToast("Import failed: invalid file format"); }
  };
  reader.readAsText(file);
  importFile.value = "";
});



renderAll();
if ("serviceWorker" in navigator) { navigator.serviceWorker.register("./sw.js"); }