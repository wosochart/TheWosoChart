var idCount = 0;
var characterDictionary = new Map();
var connectionsList = new Map();
var groupColors = new Map(); // group (country) → color

// 🔹 Shared helper
function sanitizeFilename(name) {
  return (name || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")       // remove accents
    .replace(/[^a-zA-Z0-9]+/g, " ")        // replace non-alphanumerics with spaces
    .trim()
    .split(/\s+/)                          // split into words
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join("");                             // join words together
}


// 🔹 helper to generate vibrant pastel-like color
function getPastelVibrantColor() {
  let hue = Math.floor(Math.random() * 360);
  let saturation = 70 + Math.random() * 20;
  let lightness = 60 + Math.random() * 15;
  return `hsl(${hue}, ${saturation}%, ${lightness}%)`;
}

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('Export')
    .addItem('Export Graph (JS)', 'createGraph')
    .addItem('Check Missing Rows', 'checkRows')
    .addToUi();
}

function createGraph() {
  var sheet = SpreadsheetApp.getActiveSheet();
  var data = sheet.getDataRange().getValues();

  // reset globals
  idCount = 0;
  characterDictionary = new Map();
  connectionsList = new Map();
  groupColors = new Map();

  // Add all characters (A = player, B = country, C = team)
  for (let row = 1; row < data.length; row++) {
    let displayName = (data[row][0] || "").trim(); // Column A
    let country = (data[row][1] || "").trim();     // Column B → group
    let team = (data[row][2] || "").trim();        // Column C → team
    if (!displayName) continue;

    let safeId = sanitizeFilename(displayName);
    let image = safeId || "nonplayer";
    image += ".jpg";
    image = "img/" + image;

    tryAddCharacter(displayName, country, team, image, safeId);
  }

  // Add connections → start at Column D (index 3)
  for (let row = 1; row < data.length; row++) {
    let currentCharacter = (data[row][0] || "").trim();
    let characterEntry = characterDictionary.get(currentCharacter);

    if (!characterEntry) {
      let safeId = sanitizeFilename(currentCharacter);
      characterEntry = Array.from(characterDictionary.values())
        .find(c => c.safeId === safeId);
    }
    if (!characterEntry) continue;

    for (let col = 3; col < data[row].length; col++) { // start at D
      let name = data[0][col];
      let color = sheet.getRange(1, col + 1).getBackground().replace('#', '');
      let raw = (data[row][col] || "").trim();
      extractConnections(characterEntry, raw, "#" + color, name);
    }
  }

  let nodes = buildCharacterListArray(characterDictionary.entries());
  let edges = buildConnectionsListArray(connectionsList.entries());

  Logger.log("Export complete → " + nodes.length + " nodes, " + edges.length + " edges");

  let result = "window.graphData = " + JSON.stringify({ nodes, edges }, null, 2) + ";";
  showResult(result);
}

function extractConnections(character, rawConnectionsCellValue, typeOfConnection, labelCopy) {
  if (!rawConnectionsCellValue || rawConnectionsCellValue === "-") return;

  let characterId = character.id;
  let connections = rawConnectionsCellValue.split(",");

  for (let otherCharacterName of connections) {
    let displayName = otherCharacterName.trim();
    if (!displayName) continue;

    let safeId = sanitizeFilename(displayName);
    let image = safeId || "nonplayer";
    image += ".jpg";
    image = "img/" + image;

    // We don't know the team/country for "other" names in connection cells,
    // so pass an empty team and a default group name "notgrouped".
    let otherCharacter = tryAddCharacter(displayName, "notgrouped", "", image, safeId);
    let otherCharacterId = otherCharacter.id;

    let fromto = characterId + "to" + otherCharacterId;
    let tofrom = otherCharacterId + "to" + characterId;

    // Normalize to avoid duplicate direction
    let edgeKey = fromto < tofrom ? fromto : tofrom;

    if (!connectionsList.has(edgeKey)) {
      let connection = {
        from: characterId.toString(),
        to: otherCharacterId.toString(),
        color: typeOfConnection,
        label: labelCopy,
        weight: 1
      };
      connectionsList.set(edgeKey, connection);
    } else {
      let connection = connectionsList.get(edgeKey);
      connection.weight++;
      connectionsList.set(edgeKey, connection);
    }

    character.value++;
    otherCharacter.value++;
  }
}

function buildConnectionsListArray(entries) {
  return Array.from(entries, ([, e]) => ({
    from: e.from,
    to: e.to,
    label: e.label,
    color: e.color,
    width: e.weight || 1
  }));
}

function buildCharacterListArray(entries) {
  // NOTE: we only include `group` (country) and `team` — no duplicate 'country' field.
  return Array.from(entries, ([, e]) => ({
    id: e.id.toString(),
    label: e.label,
    group: e.group,        // country
    team: e.team || "",    // team (new)
    shape: "circularImage",
    value: Math.max(10, Math.min(100, Math.pow(2 * e.value, 2))),
    image: e.image,
    brokenImage: "img/nonplayer.jpg",
    color: e.color,
    font: { color: "#000", size: 16 }
  }));
}

function tryAddCharacter(name, group, team, image, safeId) {
  if (characterDictionary.has(name)) {
    return characterDictionary.get(name);
  }

  // ensure group has a sensible value
  if (!group) group = "notgrouped";

  // Assign a random pastel-vibrant color per group (country)
  let colorValue;
  if (groupColors.has(group)) {
    colorValue = groupColors.get(group);
  } else {
    colorValue = getPastelVibrantColor();
    groupColors.set(group, colorValue);
  }

  let newCharacter = {
    id: idCount,
    label: name,
    group: group,            // country (used for node color)
    team: team || "",        // team
    shape: "circularImage",
    image: image,
    value: 1,
    safeId: safeId || "",
    color: { background: colorValue, border: colorValue }
  };

  characterDictionary.set(name, newCharacter);
  idCount++;
  return newCharacter;
}

function showResult(text) {
  var output = HtmlService.createHtmlOutput(
    "<textarea style='width:100%;' rows='20'>" + text + "</textarea>"
  );
  output.setWidth(500).setHeight(400);
  SpreadsheetApp.getUi().showModalDialog(output, 'Graph JS');
}

function checkRows() {
  let withRows = [];
  let missingRows = new Map();

  let sheet = SpreadsheetApp.getActiveSheet();
  let data = sheet.getDataRange().getValues();

  for (let row = 1; row < data.length; row++) {
    let currentCharacter = (data[row][0] || "").trim();
    if (currentCharacter) withRows.push(currentCharacter);
  }

  // Match createGraph: start at Column D (index 3)
  for (let row = 1; row < data.length; row++) {
    for (let col = 3; col < data[row].length; col++) {
      let catString = (data[row][col] || "").trim();
      if (catString !== "-" && catString !== "") {
        let connections = catString.split(",");
        for (let otherCharacterName of connections) {
          let trimmed = otherCharacterName.trim();
          if (trimmed && !withRows.includes(trimmed)) {
            let safeId = sanitizeFilename(trimmed);
            missingRows.set(trimmed, safeId);
          }
        }
      }
    }
  }

  let result;
  if (missingRows.size === 0) {
    result = "✅ No missing rows found.";
  } else {
    result = "⚠️ Names missing rows:\n\n";
    for (let [name, safeId] of missingRows.entries()) {
      result += `- ${name} → img/${safeId || "nonplayer"}.jpg\n`;
    }
  }
  showResult(result);
}
