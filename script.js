const storyPath = "data/story.json";
let storyData = null;
let currentSceneId = null;
let selectedCharacter = null;
let history = [];

const sceneHeader = document.getElementById("scene-header");
const characterCard = document.getElementById("character-card");
const sceneContent = document.getElementById("scene-content");
const choiceList = document.getElementById("choice-list");
const sourcePanel = document.getElementById("source-panel");
const sourceContent = document.getElementById("source-content");
const sourceText = document.getElementById("source-text");
const sourceCommentary = document.getElementById("source-commentary");
const backButton = document.getElementById("back-button");
const resetButton = document.getElementById("reset-button");
const progressWrap = document.getElementById("progress-wrap");
const progressVisual = document.getElementById("progress-visual");

backButton.addEventListener("click", goBack);
resetButton.addEventListener("click", resetGame);

function saveProgress() {
  const data = { currentSceneId, selectedCharacter, history };
  localStorage.setItem("haishanghua_progress", JSON.stringify(data));
}

function loadProgress() {
  const raw = localStorage.getItem("haishanghua_progress");
  if (!raw) return false;
  try {
    const data = JSON.parse(raw);
    if (data.currentSceneId && storyData && getScene(data.currentSceneId)) {
      currentSceneId = data.currentSceneId;
      selectedCharacter = data.selectedCharacter;
      history = data.history || [];
      return true;
    }
  } catch (e) {
    console.error("Failed to load progress", e);
  }
  return false;
}

function clearProgress() {
  localStorage.removeItem("haishanghua_progress");
}

function goBack() {
  if (history.length === 0) {
    currentSceneId = storyData.startScene;
    selectedCharacter = null;
    renderScene();
    return;
  }
  const last = history.pop();
  currentSceneId = last.scene;
  selectedCharacter = last.selectedCharacter;
  renderScene();
}

function loadStoryViaXHR(path) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.overrideMimeType("application/json");
    xhr.open("GET", path, true);
    xhr.onreadystatechange = function () {
      if (xhr.readyState === 4) {
        if (xhr.status === 200 || xhr.status === 0) {
          try {
            resolve(JSON.parse(xhr.responseText));
          } catch (e) {
            reject(new Error("JSON 解析失败：" + e.message));
          }
        } else {
          reject(new Error("加载失败，状态码：" + xhr.status));
        }
      }
    };
    xhr.onerror = () => reject(new Error("网络请求错误"));
    xhr.send();
  });
}

function parseSource(source) {
  const idx = source.indexOf("（解读：");
  if (idx === -1) {
    return { text: source, commentary: null };
  }
  const text = source.substring(0, idx).trim();
  let depth = 1;
  let endIdx = -1;
  for (let i = idx + 4; i < source.length; i++) {
    if (source[i] === "（") depth++;
    if (source[i] === "）") {
      depth--;
      if (depth === 0) {
        endIdx = i;
        break;
      }
    }
  }
  if (endIdx === -1) endIdx = source.lastIndexOf("）");
  const commentary = source.substring(idx + 4, endIdx).trim();
  return { text, commentary };
}

async function loadStory() {
  try {
    let data;
    try {
      const response = await fetch(storyPath + "?t=" + Date.now());
      data = await response.json();
    } catch (fetchErr) {
      data = await loadStoryViaXHR(storyPath + "?t=" + Date.now());
    }
    storyData = data;
    try {
      const relResponse = await fetch("data/relationships.json?t=" + Date.now());
      window.relationshipData = await relResponse.json();
    } catch (e) {
      window.relationshipData = null;
    }
    const hasProgress = loadProgress();
    if (!hasProgress) {
      resetGame();
    } else {
      renderScene();
    }

    const urlParams = new URLSearchParams(window.location.search);
    const preview = urlParams.get("preview");
    if (preview && storyData) {
      const introScene = getScene(storyData.startScene);
      const startChoice = introScene?.choices?.find((c) => c.character === preview);
      if (startChoice) {
        selectedCharacter = preview;
        history = [{ scene: "intro", selectedCharacter: null, choice: startChoice.text }];
        let sid = startChoice.nextScene;
        let prev = "intro";
        for (let i = 0; i < 5 && sid; i++) {
          const sc = getScene(sid);
          if (!sc) break;
          history.push({ scene: prev, selectedCharacter: preview, choice: sc.choices?.[0]?.text || "" });
          prev = sid;
          const nc = sc.choices?.[0];
          if (!nc) break;
          sid = nc.nextScene;
        }
        currentSceneId = prev;
        renderScene();
      }
    }
  } catch (error) {
    sceneHeader.innerHTML = "<h2>无法加载故事数据</h2>";
    const isFileProtocol = window.location.protocol === "file:";
    sceneContent.innerHTML = isFileProtocol
      ? "检测到你是直接打开 HTML 文件（<code>file://</code> 协议）。<br><br>请通过本地 HTTP 服务器访问："
        + "<ol><li>在项目目录运行 <code>python3 -m http.server 8080</code></li>"
        + "<li>然后在浏览器打开 <a href='http://localhost:8080' target='_blank'>http://localhost:8080</a></li></ol>"
      : (error.message || "请检查 data/story.json 文件是否存在且格式正确。");
    choiceList.innerHTML = "";
    sourcePanel.classList.add("hidden");
  }
}

function resetGame() {
  clearProgress();
  currentSceneId = storyData?.startScene || "intro";
  selectedCharacter = null;
  history = [];
  renderScene();
}

function renderRelationshipNetwork(charId, choice) {
  const network = window.relationshipData?.networks?.[charId];
  if (!network) {
    enterStory(choice);
    return;
  }

  choiceList.innerHTML = "";
  choiceList.classList.remove("character-select-grid");

  const container = document.createElement("div");
  container.className = "relationship-network-container";

  const title = document.createElement("h3");
  title.className = "network-title";
  title.innerText = network.center.name + "的人物关系";
  container.appendChild(title);

  const size = 420;
  const centerX = size / 2;
  const centerY = size / 2;
  const radius = 140;

  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 " + size + " " + size);
  svg.setAttribute("class", "network-svg");

  const nodeCount = network.nodes.length;
  network.nodes.forEach((node, i) => {
    const angle = (2 * Math.PI * i) / nodeCount - Math.PI / 2;
    const x = centerX + radius * Math.cos(angle);
    const y = centerY + radius * Math.sin(angle);

    const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
    line.setAttribute("x1", centerX);
    line.setAttribute("y1", centerY);
    line.setAttribute("x2", x);
    line.setAttribute("y2", y);
    line.setAttribute("class", "network-line");
    svg.appendChild(line);

    const midX = (centerX + x) / 2;
    const midY = (centerY + y) / 2;
    const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
    text.setAttribute("x", midX);
    text.setAttribute("y", midY);
    text.setAttribute("class", "network-relation-text");
    text.setAttribute("text-anchor", "middle");
    text.setAttribute("dominant-baseline", "middle");
    text.textContent = node.relation;
    svg.appendChild(text);

    const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    circle.setAttribute("cx", x);
    circle.setAttribute("cy", y);
    circle.setAttribute("r", 34);
    circle.setAttribute("class", "network-node-outer");
    svg.appendChild(circle);

    const nameText = document.createElementNS("http://www.w3.org/2000/svg", "text");
    nameText.setAttribute("x", x);
    nameText.setAttribute("y", y + 2);
    nameText.setAttribute("class", "network-node-text");
    nameText.setAttribute("text-anchor", "middle");
    nameText.setAttribute("dominant-baseline", "middle");
    nameText.textContent = node.name;
    svg.appendChild(nameText);

    const labelText = document.createElementNS("http://www.w3.org/2000/svg", "text");
    labelText.setAttribute("x", x);
    labelText.setAttribute("y", y + 50);
    labelText.setAttribute("class", "network-label-text");
    labelText.setAttribute("text-anchor", "middle");
    labelText.textContent = node.label;
    svg.appendChild(labelText);
  });

  const centerCircle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
  centerCircle.setAttribute("cx", centerX);
  centerCircle.setAttribute("cy", centerY);
  centerCircle.setAttribute("r", 46);
  centerCircle.setAttribute("class", "network-node-center");
  svg.appendChild(centerCircle);

  const centerText = document.createElementNS("http://www.w3.org/2000/svg", "text");
  centerText.setAttribute("x", centerX);
  centerText.setAttribute("y", centerY + 2);
  centerText.setAttribute("class", "network-center-text");
  centerText.setAttribute("text-anchor", "middle");
  centerText.setAttribute("dominant-baseline", "middle");
  centerText.textContent = network.center.name;
  svg.appendChild(centerText);

  container.appendChild(svg);

  const btnRow = document.createElement("div");
  btnRow.className = "network-btn-row";

  const backBtn = document.createElement("button");
  backBtn.className = "button button-secondary";
  backBtn.innerText = "返回选择";
  backBtn.addEventListener("click", () => {
    renderScene();
  });

  const enterBtn = document.createElement("button");
  enterBtn.className = "button button-primary";
  enterBtn.innerText = "进入剧情";
  enterBtn.addEventListener("click", () => {
    enterStory(choice);
  });

  btnRow.appendChild(backBtn);
  btnRow.appendChild(enterBtn);
  container.appendChild(btnRow);

  choiceList.appendChild(container);
}

function enterStory(choice) {
  const appShell = document.querySelector(".app-shell");
  appShell?.classList.remove("intro-phase");
  setTimeout(() => {
    doSelect(choice);
  }, 650);
}

function getScene(sceneId) {
  return storyData.scenes.find((scene) => scene.id === sceneId);
}

function isEndingScene(sceneId) {
  return sceneId === "ending" || sceneId === "ending_zp" || sceneId === "ending_wl";
}

function getCharacterPath() {
  if (!selectedCharacter) return [];
  const introScene = getScene(storyData.startScene);
  if (!introScene) return [];
  const startChoice = introScene.choices.find((c) => c.character === selectedCharacter);
  if (!startChoice) return [];

  const path = [introScene];
  let sceneId = startChoice.nextScene;
  const maxSteps = 50;
  let steps = 0;

  while (sceneId && sceneId !== "intro" && steps < maxSteps) {
    const scene = getScene(sceneId);
    if (!scene) break;
    path.push(scene);
    const nextChoice = scene.choices?.[0];
    if (!nextChoice) break;
    sceneId = nextChoice.nextScene;
    steps++;
  }
  return path;
}

function getSceneShortLabel(title) {
  const parts = title.split("：");
  return parts[parts.length - 1] || title;
}

function renderProgressVisual() {
  if (!progressVisual || !progressWrap) return;

  try {
    const fullPath = getCharacterPath();

    if (fullPath.length === 0) {
      progressWrap.classList.add("hidden");
      return;
    }

    const visitedSceneIds = new Set(history.map((h) => h.scene));
    visitedSceneIds.add(currentSceneId);

    // 只显示已走过 + 当前场景，未来不显示
    const path = fullPath.filter((s) => visitedSceneIds.has(s.id));

    if (path.length === 0) {
      progressWrap.classList.add("hidden");
      return;
    }

    const trunkY = 32;
    const nodeSpacing = 110;
    const startX = 50;

    let svgPaths = [];
    let labelsHtml = "";
    let svgWidth = startX + path.length * nodeSpacing + 40;

    path.forEach((scene, index) => {
      const nodeX = startX + index * nodeSpacing;
      const isCurrent = scene.id === currentSceneId;

      // 主绳子段（水平贝塞尔曲线）
      if (index > 0) {
        const prevX = startX + (index - 1) * nodeSpacing;
        const midX = (prevX + nodeX) / 2;
        const wave = index % 2 === 0 ? 3 : -3;
        svgPaths.push({
          d: `M ${prevX + 5},${trunkY} Q ${midX},${trunkY + wave} ${nodeX - 5},${trunkY}`,
          color: "var(--ink)",
          width: 1.5,
        });
      }

      // 场景标签（绳子上方）
      const shortLabel = getSceneShortLabel(scene.title);
      const labelClass = isCurrent ? "vine-current" : "vine-past";
      labelsHtml += `<div class="vine-node-scene ${labelClass}" style="left:${nodeX}px;top:${trunkY - 26}px">${shortLabel}</div>`;

      // 人物分支（绳子下方）
      const people = scene.keyPeople || [];
      people.forEach((person, pIndex) => {
        const branchY = trunkY + 18 + pIndex * 16;
        const endY = branchY + 8;

        // 分支曲线
        svgPaths.push({
          d: `M ${nodeX},${trunkY + 4} Q ${nodeX + 4},${branchY - 2} ${nodeX},${endY}`,
          color: "var(--border)",
          width: 0.8,
        });

        labelsHtml += `<div class="vine-node-person" style="left:${nodeX}px;top:${endY + 2}px">${person}</div>`;
      });
    });

    // 节点圆点
    let dotsHtml = "";
    path.forEach((scene, index) => {
      const nodeX = startX + index * nodeSpacing;
      const isCurrent = scene.id === currentSceneId;
      const r = isCurrent ? 5.5 : 4;
      const fill = isCurrent ? "#7a4f32" : "#2a2a2a";
      if (isCurrent) {
        dotsHtml += `<circle cx="${nodeX}" cy="${trunkY}" r="9" fill="rgba(122,79,50,0.08)"/>`;
      }
      dotsHtml += `<circle cx="${nodeX}" cy="${trunkY}" r="${r}" fill="${fill}"/>`;
    });

    const svgHeight = trunkY + 40 + Math.max(...path.map((s) => (s.keyPeople || []).length)) * 16;

    const svgHtml = `<svg class="vine-svg-h" width="${svgWidth}" height="${svgHeight}">
      ${svgPaths.map((p) => `<path d="${p.d}" stroke="${p.color}" fill="none" stroke-width="${p.width}" stroke-linecap="round"/>`).join("")}
      ${dotsHtml}
    </svg>`;

    progressVisual.style.width = `${svgWidth}px`;
    progressVisual.style.height = `${svgHeight}px`;
    progressVisual.innerHTML = svgHtml + `<div class="vine-labels-h">${labelsHtml}</div>`;
    progressWrap.classList.remove("hidden");
  } catch (err) {
    console.error("Progress visual error:", err);
    progressWrap.classList.add("hidden");
  }
}

function renderScene() {
  const scene = getScene(currentSceneId);
  if (!scene) {
    sceneHeader.innerHTML = `<h2>场景未找到</h2>`;
    sceneContent.innerText = "请检查故事配置。";
    choiceList.innerHTML = "";
    sourcePanel.classList.add("hidden");
    return;
  }

  const ending = isEndingScene(currentSceneId);
  const isIntro = currentSceneId === storyData?.startScene;
  const appShell = document.querySelector(".app-shell");

  sceneHeader.innerHTML = `<h2>${scene.title}</h2>`;

  if (ending) {
    appShell?.classList.remove("intro-phase");
    sceneContent.classList.remove("intro-ink");
    choiceList.classList.remove("intro-rise");
    sceneContent.classList.add("ending-content");
    sceneHeader.classList.add("ending-header");
    characterCard.classList.add("hidden");
    sourcePanel.classList.add("hidden");
  } else {
    sceneContent.classList.remove("ending-content");
    sceneHeader.classList.remove("ending-header");
    if (selectedCharacter) {
      showCharacterInfo(selectedCharacter);
    } else {
      characterCard.classList.add("hidden");
    }
    if (scene.source && !isIntro) {
      sourcePanel.classList.remove("hidden");
      const parsed = parseSource(scene.source);
      sourceText.innerText = parsed.text;
      if (parsed.commentary) {
        sourceCommentary.classList.remove("hidden");
        sourceCommentary.innerText = parsed.commentary;
      } else {
        sourceCommentary.classList.add("hidden");
        sourceCommentary.innerText = "";
      }
    } else {
      sourcePanel.classList.add("hidden");
      sourceCommentary.classList.add("hidden");
    }
  }

  // 序幕阶段处理
  if (isIntro) {
    appShell?.classList.add("intro-phase");
    characterCard.classList.add("hidden");
    progressWrap.classList.add("hidden");

    // 强制重流动画（确保每次进入序章都重新播放）
    sceneContent.classList.remove("intro-ink");
    sceneContent.style.animation = "none";
    void sceneContent.offsetHeight; // reflow
    sceneContent.style.animation = "";
    sceneContent.classList.add("intro-ink");

    choiceList.classList.remove("intro-rise");
    choiceList.style.animation = "none";
    void choiceList.offsetHeight;
    choiceList.style.animation = "";
  } else {
    appShell?.classList.remove("intro-phase");
    sceneContent.classList.remove("intro-ink");
    choiceList.classList.remove("intro-rise");
  }

  sceneContent.innerText = scene.content;
  renderChoices(scene.choices);

  if (isIntro) {
    choiceList.classList.add("intro-rise");
  }

  renderProgressVisual();
  saveProgress();
}

function showCharacterInfo(characterId) {
  const character = storyData.characters.find((item) => item.id === characterId);
  if (!character) {
    characterCard.classList.add("hidden");
    return;
  }

  characterCard.classList.remove("hidden");
  characterCard.innerHTML = `
    <strong>当前角色</strong>
    <h3>${character.name}</h3>
    <p>${character.description}</p>
  `;
}

function renderChoices(choices) {
  choiceList.innerHTML = "";

  // 序幕场景：渲染角色头像选择网格
  const isIntro = currentSceneId === storyData?.startScene;
  if (isIntro) {
    choiceList.classList.add("character-select-grid");
    choices.forEach((choice, index) => {
      const charId = choice.character;
      const char = storyData.characters.find((c) => c.id === charId);
      if (!char) return;

      const card = document.createElement("div");
      card.className = "character-select-card";
      if (char.hidden) {
        card.classList.add("hidden-character");
      }
      card.setAttribute("role", "button");
      card.setAttribute("tabindex", "0");

      // 头像容器
      const avatarWrap = document.createElement("div");
      avatarWrap.className = "character-avatar-wrap";

      if (char.hidden) {
        // 隐藏角色：先尝试加载图片，失败则回退到 CSS 剪影
        card.setAttribute("aria-label", "未知人物");
        const img = document.createElement("img");
        img.alt = "未知人物";
        img.loading = "lazy";
        img.className = "hidden-avatar-img";
        img.style.transition = "transform 0.35s ease";
        let imgLoaded = false;
        img.onload = () => { imgLoaded = true; };
        img.onerror = () => {
          if (!imgLoaded) {
            img.style.display = "none";
            avatarWrap.innerHTML = `<span class="avatar-fallback">${char.name[0]}</span>`;
          }
        };
        img.src = `images/${char.name}.png?t=${Date.now()}`;
        avatarWrap.appendChild(img);
      } else {
        card.setAttribute("aria-label", `选择角色：${char.name}`);
        // 尝试加载头像图片（优先匹配角色中文名，如 images/赵朴斋.png）
        const img = document.createElement("img");
        img.alt = char.name;
        img.loading = "lazy";
        const tryNextSrc = (candidates, idx) => {
          if (idx >= candidates.length) {
            img.style.display = "none";
            avatarWrap.innerHTML = `<span class="avatar-fallback">${char.name[0]}</span>`;
            return;
          }
          img.src = candidates[idx];
          img.onerror = () => tryNextSrc(candidates, idx + 1);
        };
        tryNextSrc([
          `images/${char.name}.png?t=${Date.now()}`,
          `images/${char.name}.jpg?t=${Date.now()}`,
          `images/${char.name}.jpeg?t=${Date.now()}`,
          `images/${char.name}.webp?t=${Date.now()}`,
          `images/portrait-${charId}.png`,
          `images/portrait-${charId}.jpg`,
          `images/portrait-${charId}.jpeg`,
          `images/portrait-${charId}.webp`,
          `${char.name}.png`,
          `${char.name}.jpg`,
          `${char.name}.jpeg`,
          `${char.name}.webp`,
          `portrait-${charId}.png`,
          `portrait-${charId}.jpg`,
          `portrait-${charId}.jpeg`,
          `portrait-${charId}.webp`,
        ], 0);
        avatarWrap.appendChild(img);
      }

      // 角色名
      const nameEl = document.createElement("h4");
      nameEl.className = "character-select-name";
      nameEl.innerText = char.hidden ? "隐藏人物" : char.name;

      // 简介
      const descEl = document.createElement("p");
      descEl.className = "character-select-desc";
      descEl.innerText = char.hidden ? "点击揭示身份" : char.description;

      card.appendChild(avatarWrap);
      card.appendChild(nameEl);
      card.appendChild(descEl);

      // 点击/键盘选择
      if (char.hidden) {
        // 隐藏角色：第一次点击揭示，第二次点击选择
        const handleReveal = () => {
          if (card.classList.contains("revealed")) {
            selectChoice(choice);
          } else {
            card.classList.add("revealed");
            nameEl.innerText = char.name;
            descEl.innerText = char.description;
            card.setAttribute("aria-label", `选择角色：${char.name}`);
          }
        };
        card.addEventListener("click", handleReveal);
        card.addEventListener("keydown", (e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            handleReveal();
          }
        });
      } else {
        const activate = () => selectChoice(choice);
        card.addEventListener("click", activate);
        card.addEventListener("keydown", (e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            activate();
          }
        });
      }

      choiceList.appendChild(card);
    });
    return;
  }

  // 普通场景：渲染选择按钮
  choiceList.classList.remove("character-select-grid");
  choices.forEach((choice) => {
    const button = document.createElement("button");
    button.className = "choice-button";
    button.innerText = choice.text;
    button.addEventListener("click", () => selectChoice(choice));
    choiceList.appendChild(button);
  });
}

function doSelect(choice) {
  history.push({
    scene: currentSceneId,
    selectedCharacter,
    choice: choice.text,
  });
  if (choice.character) {
    selectedCharacter = choice.character;
  }
  currentSceneId = choice.nextScene;
  renderScene();
}

function selectChoice(choice) {
  if (choice.nextScene === "__BACK__") {
    goBack();
    return;
  }

  const isIntro = currentSceneId === storyData?.startScene;
  if (isIntro && choice.character) {
    renderRelationshipNetwork(choice.character, choice);
    return;
  }
  if (isIntro) {
    enterStory(choice);
    return;
  }

  doSelect(choice);
}

loadStory();
