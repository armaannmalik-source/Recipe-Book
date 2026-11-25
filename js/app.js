const $ = id => document.getElementById(id);
const grid = $("recipeGrid");
let recipes = [];
let activeCategory = "All";
let editingImage = null;
let cookingRecipe = null;
let cookingStepIndex = 0;
let checkedIngredients = new Set();

const escapeHTML = value => String(value ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const lines = value => String(value || "").split(/\r?\n/).map(x => x.trim()).filter(Boolean);
const formatTime = value => value ? `${value} min` : "Time not set";

// Theme preference is saved locally and restored on the next visit.
function applyTheme(theme) {
  const dark = theme === "dark";
  document.documentElement.dataset.theme = dark ? "dark" : "light";
  $("themeIcon").textContent = dark ? "☀" : "☾";
  $("themeLabel").textContent = dark ? "Light mode" : "Dark mode";
  $("themeToggle").setAttribute("aria-label", dark ? "Switch to light mode" : "Switch to dark mode");
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.content = dark ? "#171c19" : "#f7f8f4";
}
const savedTheme = localStorage.getItem("recipe-book-theme") || "light";
applyTheme(savedTheme);
$("themeToggle").addEventListener("click", () => {
  const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
  localStorage.setItem("recipe-book-theme", next);
  applyTheme(next);
});

async function refresh() {
  recipes = (await RecipeDB.getAll()).sort((a,b) => b.updatedAt - a.updatedAt);
  render();
}

function render() {
  const query = $("searchInput").value.trim().toLowerCase();
  const shown = recipes.filter(r => {
    const matchesCategory = activeCategory === "All" || (activeCategory === "Favourites" ? r.favourite : r.category === activeCategory);
    const searchable = [r.name,r.category,r.ingredients,r.instructions,r.notes].join(" ").toLowerCase();
    return matchesCategory && searchable.includes(query);
  });
  $("listTitle").textContent = activeCategory === "All" ? "All recipes" : activeCategory;
  $("listEyebrow").textContent = activeCategory === "Favourites" ? "SAVED FOR LATER" : "YOUR COLLECTION";
  $("recipeCount").textContent = `${shown.length} ${shown.length === 1 ? "recipe" : "recipes"}`;
  grid.innerHTML = "";
  if (!shown.length) {
    const hasAny = recipes.length > 0;
    const title = query ? "No matching recipes" : activeCategory === "Favourites" ? "No favourites yet" : hasAny ? "Nothing in this category" : "Your cookbook starts here";
    const message = query ? "Try another search word or clear the search." : activeCategory === "Favourites" ? "Tap the heart on a recipe to keep it here." : hasAny ? "Try another category, or add a recipe to this one." : "Add a recipe you love. It will be saved privately on this device.";
    grid.innerHTML = `<div class="empty-state"><div class="empty-icon">✳</div><h3>${title}</h3><p>${message}</p>${!hasAny ? '<button class="primary-button" id="emptyAdd">＋ Add your first recipe</button>' : ""}</div>`;
    const emptyAdd = $("emptyAdd");
    if (emptyAdd) emptyAdd.addEventListener("click", openNewRecipe);
    return;
  }
  for (const recipe of shown) {
    const card = document.createElement("article");
    card.className = "recipe-card"; card.tabIndex = 0;
    const photo = recipe.image ? `<img src="${recipe.image}" alt="${escapeHTML(recipe.name)}">` : "✳";
    card.innerHTML = `<div class="recipe-photo">${photo}</div><div class="recipe-info"><div class="recipe-meta"><span class="tag">${escapeHTML(recipe.category)}</span><span class="time">${escapeHTML(formatTime(recipe.time))}</span></div><h3>${escapeHTML(recipe.name)}</h3><div class="recipe-bottom"><small>${lines(recipe.ingredients).length} ingredients · ${Number(recipe.servings)||2} servings</small><button class="favourite-button ${recipe.favourite ? "is-favourite" : ""}" aria-label="${recipe.favourite ? "Remove from" : "Add to"} favourites" title="Toggle favourite">♥</button></div></div>`;
    card.addEventListener("click", () => openDetails(recipe.id));
    card.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openDetails(recipe.id); } });
    card.querySelector(".favourite-button").addEventListener("click", async e => {
      e.stopPropagation(); recipe.favourite = !recipe.favourite; recipe.updatedAt = Date.now();
      await RecipeDB.save(recipe); await refresh();
    });
    grid.appendChild(card);
  }
}

function openNewRecipe() {
  $("recipeForm").reset(); $("recipeId").value = ""; $("formTitle").textContent = "Add a recipe";
  $("recipeServings").value = 2;
  editingImage = null; $("imagePreviewWrap").hidden = true; $("recipeImage").value = "";
  $("recipeDialog").showModal(); $("recipeName").focus();
}
function openEditRecipe(recipe) {
  $("recipeForm").reset(); $("recipeId").value = recipe.id; $("formTitle").textContent = "Edit recipe";
  $("recipeName").value = recipe.name; $("recipeCategory").value = recipe.category;
  $("recipeTime").value = recipe.time || ""; $("recipeServings").value = Number(recipe.servings)||2;
  $("recipeIngredients").value = recipe.ingredients; $("recipeInstructions").value = recipe.instructions;
  $("recipeNotes").value = recipe.notes || "";
  editingImage = recipe.image || null; $("recipeImage").value = "";
  updateImagePreview(); $("recipeDialog").showModal();
}
function updateImagePreview() {
  if (editingImage) { $("imagePreview").src = editingImage; $("imagePreviewWrap").hidden = false; }
  else $("imagePreviewWrap").hidden = true;
}

// Scales a leading ingredient quantity. Lines without a recognisable leading
// quantity are left unchanged (for example, "Salt to taste").
const fractionChars = {"½":0.5,"⅓":1/3,"⅔":2/3,"¼":0.25,"¾":0.75,"⅛":0.125,"⅜":0.375,"⅝":0.625,"⅞":0.875};
function quantityValue(token) {
  if (fractionChars[token] !== undefined) return fractionChars[token];
  if (/^\d+\s+\d+\/\d+$/.test(token)) { const [whole,frac]=token.split(/\s+/); const [n,d]=frac.split("/").map(Number); return Number(whole)+n/d; }
  if (/^\d+\/\d+$/.test(token)) { const [n,d]=token.split("/").map(Number); return d ? n/d : NaN; }
  return Number(token);
}
function prettyQuantity(value) {
  if (!Number.isFinite(value)) return String(value);
  const whole=Math.floor(value+1e-8), fraction=value-whole;
  const eighth=Math.round(fraction*8);
  const map={1:"⅛",2:"¼",3:"⅜",4:"½",5:"⅝",6:"¾",7:"⅞"};
  if (eighth===0) return String(whole);
  if (eighth===8) return String(whole+1);
  return (whole ? whole+" " : "")+map[eighth];
}
function scaleIngredient(line, factor) {
  const match=line.match(/^(\s*)(\d+\s+\d+\/\d+|\d+\/\d+|\d+(?:\.\d+)?|[½⅓⅔¼¾⅛⅜⅝⅞])(?=\s|$)(.*)$/);
  if (!match) return line;
  const amount=quantityValue(match[2]);
  if (!Number.isFinite(amount)) return line;
  return match[1]+prettyQuantity(amount*factor)+match[3];
}
function openDetails(id) {
  const recipe = recipes.find(r => r.id === id); if (!recipe) return;
  const baseServings=Math.max(1,Number(recipe.servings)||2);
  const image = recipe.image ? `<img src="${recipe.image}" alt="${escapeHTML(recipe.name)}">` : "✳";
  $("detailContent").innerHTML = `<div class="detail-hero">${image}</div><div class="detail-body"><p class="eyebrow">${escapeHTML(recipe.category)} · ${escapeHTML(formatTime(recipe.time))}</p><h2>${escapeHTML(recipe.name)}</h2><div class="detail-actions"><button class="small-action" id="detailFavourite">${recipe.favourite ? "♥ Remove favourite" : "♡ Add to favourites"}</button><button class="small-action" id="startCooking">▶ Cooking mode</button><button class="small-action" id="detailEdit">Edit recipe</button><button class="small-action" id="detailDelete">Delete</button></div><div class="serving-tool"><label for="targetServings">Servings</label><input id="targetServings" type="number" min="1" max="100" step="1" value="${baseServings}"><span class="scale-note">Original recipe: ${baseServings} servings · quantities adjust automatically</span></div><h3>Ingredients</h3><ul class="scaled-ingredients" id="scaledIngredients">${lines(recipe.ingredients).map(x=>`<li>${escapeHTML(x)}</li>`).join("")}</ul><h3>Instructions</h3><ol>${lines(recipe.instructions).map(x=>`<li>${escapeHTML(x)}</li>`).join("")}</ol>${recipe.notes ? `<h3>Personal notes</h3><p class="notes">${escapeHTML(recipe.notes)}</p>` : ""}</div>`;
  $("detailDialog").showModal();
  $("startCooking").addEventListener("click", () => openCookingMode(recipe));
  $("targetServings").addEventListener("input", () => {
    const target=Math.max(1,Math.min(100,Number($("targetServings").value)||baseServings));
    const factor=target/baseServings;
    $("scaledIngredients").innerHTML=lines(recipe.ingredients).map(x=>`<li>${escapeHTML(scaleIngredient(x,factor))}</li>`).join("");
  });
  $("detailFavourite").addEventListener("click", async () => { recipe.favourite=!recipe.favourite; recipe.updatedAt=Date.now(); await RecipeDB.save(recipe); await refresh(); openDetails(id); });
  $("detailEdit").addEventListener("click", () => { $("detailDialog").close(); openEditRecipe(recipe); });
  $("detailDelete").addEventListener("click", async () => {
    if (confirm(`Delete "${recipe.name}" from your Recipe Book?`)) { await RecipeDB.remove(id); $("detailDialog").close(); await refresh(); }
  });
}

function openCookingMode(recipe) {
  cookingRecipe = recipe;
  cookingStepIndex = 0;
  checkedIngredients = new Set();
  $("cookingTitle").textContent = recipe.name;
  renderCookingIngredients();
  renderCookingStep();
  $("cookingDialog").showModal();
}
function renderCookingIngredients() {
  const ingredients = lines(cookingRecipe?.ingredients || "");
  $("cookingIngredients").innerHTML = ingredients.map((ingredient, index) => `
    <label class="ingredient-check ${checkedIngredients.has(index) ? "checked" : ""}">
      <input type="checkbox" data-ingredient="${index}" ${checkedIngredients.has(index) ? "checked" : ""}>
      <span>${escapeHTML(ingredient)}</span>
    </label>`).join("") || '<p class="form-hint">No ingredients listed.</p>';
  $("checklistProgress").textContent = `${checkedIngredients.size} of ${ingredients.length} ingredients ready`;
  $("cookingIngredients").querySelectorAll("input[data-ingredient]").forEach(input => {
    input.addEventListener("change", () => {
      const index = Number(input.dataset.ingredient);
      if (input.checked) checkedIngredients.add(index); else checkedIngredients.delete(index);
      renderCookingIngredients();
    });
  });
}
function renderCookingStep() {
  const steps = lines(cookingRecipe?.instructions || "");
  const total = Math.max(steps.length, 1);
  cookingStepIndex = Math.max(0, Math.min(cookingStepIndex, total - 1));
  $("stepCounter").textContent = `Step ${cookingStepIndex + 1} of ${total}`;
  $("cookingStep").textContent = steps[cookingStepIndex] || "No instructions available.";
  $("stepProgressBar").style.width = `${((cookingStepIndex + 1) / total) * 100}%`;
  $("previousStep").disabled = cookingStepIndex === 0;
  $("nextStep").textContent = cookingStepIndex === total - 1 ? "Finished ✓" : "Next →";
  $("nextStep").disabled = cookingStepIndex === total - 1;
}
$("closeCooking").addEventListener("click", () => $("cookingDialog").close());
$("resetChecklist").addEventListener("click", () => { checkedIngredients.clear(); renderCookingIngredients(); });
$("previousStep").addEventListener("click", () => { cookingStepIndex--; renderCookingStep(); });
$("nextStep").addEventListener("click", () => { cookingStepIndex++; renderCookingStep(); });

function downloadBackup() {
  RecipeDB.getAll().then(all => {
    const backup={app:"Recipe Book",formatVersion:1,exportedAt:new Date().toISOString(),recipes:all};
    const blob=new Blob([JSON.stringify(backup,null,2)],{type:"application/json"});
    const url=URL.createObjectURL(blob); const a=document.createElement("a");
    a.href=url; a.download=`recipe-book-backup-${new Date().toISOString().slice(0,10)}.json`;
    document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
    alert(`Backup created with ${all.length} ${all.length===1?"recipe":"recipes"}. Keep the file somewhere safe.`);
  }).catch(err=>{console.error(err);alert("Could not create the backup. Please try again.");});
}
async function restoreBackup(file) {
  if (!file) return;
  if (file.size > 30*1024*1024) { alert("This backup is larger than 30 MB."); return; }
  try {
    const data=JSON.parse(await file.text());
    const imported=Array.isArray(data) ? data : data.recipes;
    if (!Array.isArray(imported)) throw new Error("The file does not contain a Recipe Book backup.");
    const valid=imported.filter(r=>r && typeof r.id==="string" && typeof r.name==="string" && typeof r.ingredients==="string" && typeof r.instructions==="string");
    if (!valid.length && imported.length) throw new Error("No valid recipes were found in this backup.");
    if (!confirm(`Restore ${valid.length} recipes? Existing recipes with matching IDs will be updated. Other recipes will be kept.`)) return;
    for (const r of valid) {
      await RecipeDB.save({id:r.id,name:r.name,category:typeof r.category==="string"?r.category:"Other",time:Number(r.time)||0,servings:Math.max(1,Number(r.servings)||2),ingredients:r.ingredients,instructions:r.instructions,notes:typeof r.notes==="string"?r.notes:"",image:typeof r.image==="string"?r.image:null,favourite:Boolean(r.favourite),createdAt:Number(r.createdAt)||Date.now(),updatedAt:Number(r.updatedAt)||Date.now()});
    }
    await refresh(); alert(`Restore complete. ${valid.length} recipes imported.`);
  } catch(err) { console.error(err); alert(`Could not restore this file: ${err.message}`); }
  finally { $("restoreFile").value=""; }
}

$("addRecipeBtn").addEventListener("click", openNewRecipe);
$("closeDialog").addEventListener("click", () => $("recipeDialog").close());
$("cancelDialog").addEventListener("click", () => $("recipeDialog").close());
$("closeDetail").addEventListener("click", () => $("detailDialog").close());
$("settingsBtn").addEventListener("click", () => $("aboutDialog").showModal());
$("closeAbout").addEventListener("click", () => $("aboutDialog").close());
$("searchInput").addEventListener("input", render);
$("backupBtn").addEventListener("click", downloadBackup);
$("restoreBtn").addEventListener("click", () => $("restoreFile").click());
$("restoreFile").addEventListener("change", e => restoreBackup(e.target.files[0]));
$("categoryFilters").addEventListener("click", e => {
  const button=e.target.closest("[data-category]"); if (!button) return;
  activeCategory=button.dataset.category;
  document.querySelectorAll(".filter").forEach(b=>b.classList.toggle("active",b===button)); render();
});
$("recipeImage").addEventListener("change", e => {
  const file=e.target.files[0]; if (!file) return;
  if (!file.type.startsWith("image/")) return alert("Please choose an image file.");
  if (file.size>5*1024*1024) { alert("Please choose an image smaller than 5 MB."); e.target.value=""; return; }
  const reader=new FileReader(); reader.onload=()=>{editingImage=reader.result;updateImagePreview();}; reader.readAsDataURL(file);
});
$("removeImage").addEventListener("click",()=>{editingImage=null;$("recipeImage").value="";updateImagePreview();});
$("recipeForm").addEventListener("submit",async e=>{
  e.preventDefault();
  const id=$("recipeId").value||(crypto.randomUUID?crypto.randomUUID():`${Date.now()}-${Math.random()}`);
  const existing=recipes.find(r=>r.id===id);
  const recipe={id,name:$("recipeName").value.trim(),category:$("recipeCategory").value,time:Number($("recipeTime").value)||0,servings:Math.max(1,Number($("recipeServings").value)||2),ingredients:$("recipeIngredients").value.trim(),instructions:$("recipeInstructions").value.trim(),notes:$("recipeNotes").value.trim(),image:editingImage,favourite:existing?existing.favourite:false,createdAt:existing?existing.createdAt:Date.now(),updatedAt:Date.now()};
  if(!recipe.name||!recipe.ingredients||!recipe.instructions)return;
  await RecipeDB.save(recipe);$("recipeDialog").close();await refresh();
});
refresh().catch(error=>{console.error(error);grid.innerHTML='<div class="empty-state"><h3>Could not open your cookbook</h3><p>Please open this app through a local web server or its hosted address, then try again.</p></div>';});
