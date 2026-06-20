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

function renderRelationshipNetwork(centerId, choice) {
  const nodes = window.relationshipData?.nodes || [];
  const edges = window.relationshipData?.edges || [];

  const centerNode = nodes.find(n => n.id === centerId);
  if (!centerNode) {
    if (choice) enterStory(choice);
    return;
  }

  choiceList.innerHTML = "";
  choiceList.classList.remove("character-select-grid");

  const container = document.createElement("div");
  container.className = "relationship-network-container";
  container.style.width = "100%";
  container.style.maxWidth = "900px";

  const title = document.createElement("h3");
  title.className = "network-title";
  title.innerText = centerNode.name + "的人物关系网";
  container.appendChild(title);

  // ECharts 容器
  const chartDiv = document.createElement("div");
  chartDiv.style.width = "100%";
  chartDiv.style.height = "600px";
  container.appendChild(chartDiv);

  // 计算每个节点的连接数（degree）
  const degree = {};
  nodes.forEach(n => degree[n.id] = 0);
  edges.forEach(e => {
    degree[e.source] = (degree[e.source] || 0) + 1;
    degree[e.target] = (degree[e.target] || 0) + 1;
  });

  // BFS 计算距离（以 centerId 为中心）
  const distances = {};
  nodes.forEach(n => distances[n.id] = Infinity);
  distances[centerId] = 0;
  const queue = [centerId];
  let head = 0;
  while (head < queue.length) {
    const cur = queue[head++];
    edges.forEach(e => {
      if (e.source === cur && distances[e.target] === Infinity) {
        distances[e.target] = distances[cur] + 1;
        queue.push(e.target);
      } else if (e.target === cur && distances[e.source] === Infinity) {
        distances[e.source] = distances[cur] + 1;
        queue.push(e.source);
      }
    });
  }

  // 类别配置
  const categories = [
    { name: '倌人', itemStyle: { color: '#c23531' } },
    { name: '嫖客', itemStyle: { color: '#2f4554' } },
    { name: '老鸨', itemStyle: { color: '#d48265' } },
    { name: '仆人', itemStyle: { color: '#91c7ae' } },
    { name: '其他', itemStyle: { color: '#bda29a' } }
  ];

  const categoryNames = ['courtesan', 'client', 'madam', 'servant', 'other'];
  const categoryIndex = {};
  categoryNames.forEach((name, i) => categoryIndex[name] = i);

  // 统一关系词
  function getRelationLabel(edge, fromCenter) {
    const r = edge.relation;
    if (r === '生意往来') return '生意往来';
    if (r === '亲戚') return '亲戚';
    if (r === '帮闲') return '帮闲';
    if (r === '朋友' || r === '赌友') return '朋友';
    if (r === '相识') return '相识';
    if (r === '姐妹') return '\"姐妹\"';
    if (r === '恩客') {
      return fromCenter === edge.source ? '恩客' : '相好';
    }
    if (r === '相好') {
      return fromCenter === edge.source ? '相好' : '恩客';
    }
    if (r === '情人') return '朋友';
    if (r === '鸨母') {
      return fromCenter === edge.source ? '鸨母' : '手下';
    }
    if (r === '主仆') {
      return fromCenter === edge.source ? '主仆' : '打工';
    }
    return r;
  }

  // 连线颜色映射
  function getEdgeColor(relation) {
    if (relation === '恩客' || relation === '相好') return '#c23531';
    if (relation === '亲戚') return '#8B4513';
    if (relation === '主仆' || relation === '打工') return '#2f4554';
    if (relation === '鸨母') return '#d48265';
    return '#999999';
  }

  function getEdgeType(relation) {
    if (relation === '主仆' || relation === '打工') return 'dashed';
    return 'solid';
  }

  // 构建 ECharts 节点数据
  const graphNodes = nodes.map(n => {
    const dist = distances[n.id] === Infinity ? 99 : distances[n.id];
    const isCenter = n.id === centerId;
    const baseSize = isCenter ? 55 : dist === 1 ? 42 : dist === 2 ? 34 : 28;
    const size = baseSize + Math.min(degree[n.id] || 0, 8) * 2;
    const opacity = isCenter ? 1.0 : dist === 1 ? 0.95 : dist === 2 ? 0.5 : 0.2;
    const catIdx = categoryIndex[n.category] !== undefined ? categoryIndex[n.category] : 5;

    return {
      id: n.id,
      name: n.name,
      value: degree[n.id] || 0,
      category: catIdx,
      symbolSize: size,
      itemStyle: {
        opacity: opacity,
        borderColor: isCenter ? '#fff' : 'transparent',
        borderWidth: isCenter ? 3 : 0,
        shadowBlur: isCenter ? 20 : 0,
        shadowColor: isCenter ? 'rgba(194, 53, 49, 0.4)' : 'transparent'
      },
      label: {
        show: true,
        fontSize: isCenter ? 15 : dist === 1 ? 13 : dist === 2 ? 12 : 10,
        fontWeight: isCenter ? 700 : 500,
        color: isCenter ? '#fff' : (catIdx === 0 || catIdx === 1) ? '#fff' : '#333'
      },
      _dist: dist,
      _isCenter: isCenter
    };
  }).filter(n => n._dist <= 3 || n._isCenter);

  const visibleNodeIds = new Set(graphNodes.map(n => n.id));

  // 构建 ECharts 连线数据
  const graphEdges = edges.map(e => {
    const label = getRelationLabel(e, centerId);
    const isCenterEdge = e.source === centerId || e.target === centerId;
    const p1 = graphNodes.find(n => n.id === e.source);
    const p2 = graphNodes.find(n => n.id === e.target);
    if (!p1 || !p2) return null;

    const avgOpacity = (p1.itemStyle.opacity + p2.itemStyle.opacity) / 2;
    return {
      source: e.source,
      target: e.target,
      value: label,
      lineStyle: {
        color: getEdgeColor(e.relation),
        type: getEdgeType(e.relation),
        width: isCenterEdge ? 2 : 1,
        opacity: isCenterEdge ? Math.max(0.4, avgOpacity * 0.8) : avgOpacity * 0.4,
        curveness: 0.15
      },
      label: {
        show: avgOpacity > 0.4,
        formatter: label,
        fontSize: 10,
        color: '#666'
      }
    };
  }).filter(e => e !== null);

  choiceList.appendChild(container);

  // 初始化 ECharts（必须在容器插入 DOM 之后）
  const chart = echarts.init(chartDiv);

  const option = {
    tooltip: {
      trigger: 'item',
      formatter: function(params) {
        if (params.dataType === 'node') {
          const catName = categories[params.data.category]?.name || '其他';
          return `<b>${params.name}</b><br/>类别：${catName}`;
        }
        return `${params.data.value}`;
      }
    },
    legend: {
      data: categories.map(c => c.name),
      top: 10,
      left: 10,
      textStyle: { fontSize: 12, color: '#666' }
    },
    series: [{
      type: 'graph',
      layout: 'force',
      roam: true,  // 支持缩放/平移
      draggable: true,
      data: graphNodes,
      links: graphEdges,
      categories: categories,
      focusNodeAdjacency: true,
      force: {
        repulsion: 1200,
        gravity: 0.05,
        edgeLength: [100, 250],
        layoutAnimation: true
      },
      edgeSymbol: ['none', 'none'],
      label: {
        show: true,
        position: 'inside',
        formatter: '{b}'
      },
      emphasis: {
        focus: 'adjacency',
        lineStyle: {
          width: 3
        }
      },
      lineStyle: {
        curveness: 0.15
      }
    }]
  };

  chart.setOption(option);

  // 限制缩放范围（防止过度缩小）
  const MIN_ZOOM = 0.6;
  const MAX_ZOOM = 2.5;
  chart.getZr().on('mousewheel', function() {
    setTimeout(function() {
      const opt = chart.getOption();
      const zoom = (opt.series && opt.series[0] && opt.series[0].zoom) || 1;
      if (zoom < MIN_ZOOM) {
        chart.setOption({ series: [{ zoom: MIN_ZOOM }] });
      } else if (zoom > MAX_ZOOM) {
        chart.setOption({ series: [{ zoom: MAX_ZOOM }] });
      }
    }, 10);
  });

  // 点击节点切换中心
  chart.on('click', function(params) {
    if (params.dataType === 'node') {
      const clickedId = params.data.id;
      if (clickedId !== centerId) {
        const introScene = storyData.scenes.find(s => s.id === storyData.startScene);
        const nextChoice = introScene?.choices?.find(c => c.character === clickedId);
        renderRelationshipNetwork(clickedId, nextChoice);
      }
    }
  });

  // 响应窗口大小变化
  window.addEventListener('resize', function() {
    chart.resize();
  });

  // 按钮行
  const btnRow = document.createElement("div");
  btnRow.className = "network-btn-row";

  const backBtn = document.createElement("button");
  backBtn.className = "button button-secondary";
  backBtn.innerText = "返回选择";
  backBtn.addEventListener("click", () => renderScene());

  const enterBtn = document.createElement("button");
  if (choice) {
    enterBtn.className = "button button-primary";
    enterBtn.innerText = "进入剧情";
    enterBtn.addEventListener("click", () => enterStory(choice));
  } else {
    enterBtn.className = "button button-secondary";
    enterBtn.innerText = "该角色暂无剧情";
    enterBtn.disabled = true;
    enterBtn.style.opacity = "0.6";
  }

  btnRow.appendChild(backBtn);
  btnRow.appendChild(enterBtn);
  container.appendChild(btnRow);
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
  return sceneId === "ending" || sceneId.endsWith("_ending");
}

function isPostscriptScene(sceneId) {
  return sceneId.endsWith("_postscript");
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
  const postscript = isPostscriptScene(currentSceneId);
  const isIntro = currentSceneId === storyData?.startScene;

  // 在人物结局界面隐藏“返回上一步”，仅保留“回到序章”
  backButton.style.display = ending ? "none" : "";
  const appShell = document.querySelector(".app-shell");
  const enteringPostscript = postscript && !appShell?.classList.contains("postscript-phase");

  sceneHeader.innerHTML = `<h2>${scene.title}</h2>`;

  if (postscript) {
    appShell?.classList.remove("intro-phase");
    appShell?.classList.add("postscript-phase");
    sceneContent.classList.remove("intro-ink", "ending-content");
    sceneHeader.classList.remove("ending-header");
    sceneHeader.classList.add("postscript-header");
    sceneContent.classList.add("postscript-content");
    choiceList.classList.remove("intro-rise");
    characterCard.classList.add("hidden");
    sourcePanel.classList.add("hidden");
    progressWrap.classList.add("hidden");

    if (enteringPostscript) {
      sceneContent.innerHTML = "";
      choiceList.innerHTML = "";
      renderProgressVisual();
      saveProgress();
      openCloudPostscript(scene, scene.choices);
      return;
    }
  } else if (ending) {
    choiceList.style.opacity = "";
    choiceList.style.pointerEvents = "";
    choiceList.style.transition = "";
    appShell?.classList.remove("intro-phase", "postscript-phase");
    sceneContent.classList.remove("intro-ink", "postscript-content");
    sceneHeader.classList.remove("postscript-header");
    choiceList.classList.remove("intro-rise");
    sceneContent.classList.add("ending-content");
    sceneHeader.classList.add("ending-header");
    characterCard.classList.add("hidden");
    sourcePanel.classList.add("hidden");
  } else {
    choiceList.style.opacity = "";
    choiceList.style.pointerEvents = "";
    choiceList.style.transition = "";
    appShell?.classList.remove("intro-phase", "postscript-phase");
    sceneContent.classList.remove("ending-content", "postscript-content");
    sceneHeader.classList.remove("ending-header", "postscript-header");
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

  if (postscript) {
    renderPostscript(scene);
  } else {
    sceneContent.innerText = scene.content;
  }
  renderChoices(scene.choices);

  if (isIntro) {
    choiceList.classList.add("intro-rise");
  }

  renderProgressVisual();
  saveProgress();
}

let postscriptTypingTimer = null;
let postscriptClickHandler = null;
let cloudStampClickHandler = null;

function escapeHtml(text) {
  const div = document.createElement("div");
  div.innerText = text;
  return div.innerHTML;
}

function openCloudPostscript(scene, choices) {
  const curtain = document.getElementById("cloud-curtain");
  const appShell = document.querySelector(".app-shell");
  if (!curtain) {
    // 回退：在主体区域渲染
    renderPostscript(scene);
    renderChoices(choices);
    return;
  }

  // 1. 淡出主界面
  appShell?.classList.add("transition-fading");

  // 2. 显示云幕并开始关闭（右下角墨色晕染）
  curtain.classList.remove("hidden", "opening", "cloud-text-visible");
  curtain.classList.add("closing");

  // 3. 并行加载跋全文，同时保证墨晕动画至少播放 2.2s
  Promise.all([
    loadCloudPostscriptContent(scene),
    new Promise((resolve) => setTimeout(resolve, 2200)),
  ]).then(([content]) => {
    renderCloudContent(scene, choices, content);
    curtain.classList.add("cloud-text-visible");
  });
}

async function loadCloudPostscriptContent(scene) {
  let fullText = "";
  try {
    const res = await fetch("postscript.txt?t=" + Date.now());
    fullText = await res.text();
  } catch (e) {
    fullText = scene.source || "";
  }

  const paragraphs = fullText.trim().split(/\n+/).filter((p) => p.trim());
  return {
    paragraphs,
    note: scene.content || "",
  };
}

function renderCloudContent(scene, choices, content) {
  const dreamInner = document.getElementById("dream-text-inner");
  const dreamChoices = document.getElementById("dream-choices");
  const scrollHint = document.getElementById("dream-text-hint");
  if (!dreamInner || !dreamChoices) return;

  // 清除旧内容与旧监听
  dreamInner.innerHTML = "";
  dreamChoices.innerHTML = "";
  const oldScrollHandler = dreamInner._dreamScrollHandler;
  if (oldScrollHandler) dreamInner.removeEventListener("scroll", oldScrollHandler);

  // 标题
  const titleDiv = document.createElement("div");
  titleDiv.className = "dream-text-title";
  titleDiv.innerText = scene.title || "跋";
  dreamInner.appendChild(titleDiv);

  // 跋正文（按段落）
  const bodyDiv = document.createElement("div");
  bodyDiv.className = "dream-text-body";
  content.paragraphs.forEach((p) => {
    const para = document.createElement("p");
    para.innerText = p.trim();
    bodyDiv.appendChild(para);
  });
  dreamInner.appendChild(bodyDiv);

  // 署名
  const sourceDiv = document.createElement("div");
  sourceDiv.className = "dream-text-source";
  sourceDiv.innerText = "—— 花也怜侬";
  dreamInner.appendChild(sourceDiv);

  // 角色按语（scene.content）
  if (content.note && content.note.trim()) {
    const noteDiv = document.createElement("div");
    noteDiv.className = "dream-text-note";
    noteDiv.innerText = content.note.trim();
    dreamInner.appendChild(noteDiv);
  }

  // 滚动监听
  const scrollHandler = () => updateCloudScrollHint();
  dreamInner._dreamScrollHandler = scrollHandler;
  dreamInner.addEventListener("scroll", scrollHandler);

  // 滚动提示点击：向下滚动一屏
  if (scrollHint) {
    scrollHint.onclick = () => {
      dreamInner.scrollTo({
        top: dreamInner.scrollTop + dreamInner.clientHeight * 0.75,
        behavior: "smooth",
      });
    };
  }

  // 渲染选择按钮
  choices.forEach((choice) => {
    const btn = document.createElement("button");
    btn.className = "dream-choice-button";
    btn.innerText = choice.text;
    btn.addEventListener("click", () => {
      closeCloudPostscript(() => {
        if (choice.nextScene === "__BACK__") {
          goBack();
        } else {
          doSelect(choice);
        }
      });
    });
    dreamChoices.appendChild(btn);
  });

  // 阅读跋界面统一添加“获取物件”按钮
  const getObjectBtn = document.createElement("button");
  getObjectBtn.className = "dream-choice-button";
  getObjectBtn.innerText = "获取物件";
  getObjectBtn.addEventListener("click", () => {
    showObjectModal(scene);
  });
  dreamChoices.appendChild(getObjectBtn);

  // 阅读跋界面统一添加“返回序幕”按钮
  const backToIntroBtn = document.createElement("button");
  backToIntroBtn.className = "dream-choice-button";
  backToIntroBtn.innerText = "返回序幕";
  backToIntroBtn.addEventListener("click", () => {
    closeCloudPostscript(() => {
      resetGame();
    });
  });
  dreamChoices.appendChild(backToIntroBtn);

  // 初始判断是否需要滚动提示
  requestAnimationFrame(() => updateCloudScrollHint());
}

function updateCloudScrollHint() {
  const dreamInner = document.getElementById("dream-text-inner");
  const scrollHint = document.getElementById("dream-text-hint");
  if (!dreamInner || !scrollHint) return;

  const canScroll = dreamInner.scrollHeight > dreamInner.clientHeight + 4;
  const nearBottom = dreamInner.scrollTop + dreamInner.clientHeight >= dreamInner.scrollHeight - 24;

  if (canScroll && !nearBottom) {
    scrollHint.classList.remove("hidden");
  } else {
    scrollHint.classList.add("hidden");
  }
}

function closeCloudPostscript(onComplete) {
  const curtain = document.getElementById("cloud-curtain");
  const appShell = document.querySelector(".app-shell");
  if (!curtain) {
    onComplete?.();
    return;
  }

  // 隐藏文字容器
  curtain.classList.remove("cloud-text-visible");

  setTimeout(() => {
    curtain.classList.remove("closing");
    curtain.classList.add("opening");

    // 主界面淡入（以浅色面貌重现，避免与深色跋背景冲突）
    appShell?.classList.remove("transition-fading", "postscript-phase");
    appShell?.classList.add("transition-fading-in");
    setTimeout(() => {
      appShell?.classList.remove("transition-fading-in");
    }, 1200);

    setTimeout(() => {
      curtain.classList.add("hidden");
      curtain.classList.remove("opening");
      const dreamInner = document.getElementById("dream-text-inner");
      if (dreamInner) {
        const handler = dreamInner._dreamScrollHandler;
        if (handler) dreamInner.removeEventListener("scroll", handler);
        dreamInner.innerHTML = "";
      }
      const dreamChoices = document.getElementById("dream-choices");
      if (dreamChoices) dreamChoices.innerHTML = "";

      onComplete?.();
    }, 1500);
  }, 400);
}

/* ── 物件界面 ── */
const objectTexts = {
  "黄翠凤": `拜盒是黄翠凤的物件。她和罗子富情谊初定，可仍有个蒋月琴，翠凤怎能做“垫空”，她要求罗子富二选一，此外口说无凭，定要罗子富拿个凭证来，就不怕他将来反悔。
黄翠凤看不上洋钱，看不上十对钏臂，只说“拜盒蛮好。”
翠凤当然知道洋钱，钏臂这些个东西本身多少钱，就值多少钱。而拜盒不一样，看起来对黄翠凤黄二姐这拜盒没什么价值，可对于罗子富——这一当朝候补官员确实要紧得很。
黄翠凤不仅选择了罗子富的拜盒，还给自己也准备一个一模一样的。
赎身那日，她将再三复勘后的赎身文书装入自己的拜盒，并且与罗子富那只一起藏入朱漆皮箱。此时的黄翠凤再也与“无辜”两次不相干，不论她是否和黄二姐演戏诈骗，仅凭这大同小异的拜盒，她那张阴谋的网已经织得七七八八。罗子富也许感受到了某种不详，可是他已经来不及抽身。

选择走完黄翠凤的故事线，你获得的物件是拜盒。`,
  "周双玉": `物件不揭示人物命运，仅仅只是代表人物在某个时间某个场所的选择。毕竟《海上花》从开始到结束也不过不到一年的时间，任何人都不能妄谈书中人的命运。
物件代表的是选择。人物在某时某刻选择了某个物件，某种层度上也选择了自己的命运。
蟋蟀盒是周双玉的物件。逗蛐蛐有几分游戏意味，所以双玉，淑人和翠芬才津津有味。与翠凤的单纯可爱与淑人的心不在焉比，双玉受邀来到大观园，心理多少有几分忐忑，她知道那个盟誓是虚妄的，一边是游戏一边是命运，双玉在不知不觉中选了一条险峻艰难却可以峰回路转的道路。
促织罐是她小女孩的玩心，也藏着她缜密的布局和思虑。
五月斯螽动股，六月莎鸡振羽，七月在野，八月在宇，九月在户，十月蟋蟀入我床下。穹窒熏鼠，塞向墐户。嗟我妇子，曰为改岁，入此室处。
在不确定的寒秋到来之前，她利用促织罐给自己做了一个确定的Plan B。
选择走完双玉的故事线，你获得的物件是促织罐。`,
  "匡二": `当票是匡二的物件。
见识了大上海的花花世界，看到自己的主人李鹤汀身陷赌局所有的财务即将被掏空，又见四老爷李实夫像个冤大头一样被诸三姐和诸十全哄骗，匡二自有自己的一份清醒。
那日从潘三处鬼混回来张寿一直同匡二打听着潘三，匡二自是不说用“我哪有有钱”搪塞过去。他与潘三红尘相识，姻缘自定，只差一份赎身和置产的钱就能远走高飞。与其让周少和、殳三这种流氓地痞骗得大少爷倾家荡产，还不如将那贵重财物拿来一用。
匡二“盗亦有盗”将当票都留下了，李鹤汀知道他是留与主人赎还原物用，居然在破财之余“心中一宽”，可见李家财富之雄厚，匡二盗走的不过是九牛一毛。

选择走完匡二的故事，你获得物件是当票。`,
};

const objectImages = {
  "黄翠凤": "images/人物與物件/浮雕锦地花鸟纹紫檀方盒.png",
  "周双玉": "images/人物與物件/葫蘆鑲象牙蟋蟀盒.jpeg",
};

// 场景 ID 前缀（如 cf / kuang / sy）与 characters 数组中 character.id 的映射
const prefixToCharacterId = {
  "cf": "huangcuifeng",
  "kuang": "kuanger",
  "sy": "zhoushuangyu",
  "xh": "shenxiaohong",
  "wl": "wangliansheng",
  "zp": "zhaopuzhai",
  "eb": "zhaoerbao",
  "ht": "liheting",
  "cxy": "chenxiaoyun",
  "ajin": "ajin",
};

function getCharacterPrefixFromPostscript(sceneId) {
  if (!sceneId || !sceneId.endsWith("_postscript")) return null;
  return sceneId.replace("_postscript", "");
}

function resolveCharacterNameFromScene(scene) {
  // 优先使用当前全局选中的角色（intro 选择后写入 selectedCharacter）
  if (selectedCharacter) {
    const bySelection = storyData?.characters?.find((c) => c.id === selectedCharacter);
    if (bySelection?.name) return bySelection.name;
  }

  // 否则从场景 ID 前缀反查 character.id，再取 name
  const prefix = getCharacterPrefixFromPostscript(scene?.id);
  if (!prefix) return "";
  const characterId = prefixToCharacterId[prefix];
  const character = storyData?.characters?.find((c) => c.id === (characterId || prefix));
  return character?.name || "";
}

function showObjectModal(scene) {
  const modal = document.getElementById("object-modal");
  const title = document.getElementById("object-title");
  const imageWrap = document.getElementById("object-image-wrap");
  const textEl = document.getElementById("object-text");
  const revealBtn = document.getElementById("object-reveal-btn");
  if (!modal || !title || !imageWrap || !textEl || !revealBtn) return;

  const charName = resolveCharacterNameFromScene(scene);

  title.innerText = charName ? `物件·${charName}` : "物件";

  // 文字
  const text = charName && objectTexts[charName]
    ? objectTexts[charName]
    : "该人物物件文字待更新。";
  textEl.innerText = text;

  // 重置为“未收获”状态：显示按钮、隐藏图片区
  imageWrap.innerHTML = "";
  imageWrap.classList.add("hidden");
  revealBtn.classList.remove("hidden");
  revealBtn.disabled = false;
  revealBtn.innerText = "收获物件";

  // 把当前图片路径和角色名写入 data 属性，供按钮点击时读取
  const imagePath = charName && objectImages[charName]
    ? objectImages[charName]
    : "";
  revealBtn.dataset.imagePath = imagePath;
  revealBtn.dataset.charName = charName || "";

  modal.classList.remove("hidden");
  document.body.style.overflow = "hidden";
}

function hideObjectModal() {
  const modal = document.getElementById("object-modal");
  if (!modal) return;
  modal.classList.add("hidden");
  document.body.style.overflow = "";
}

function initObjectModal() {
  const backdrop = document.getElementById("object-modal-backdrop");
  const closeBtn = document.getElementById("object-close");
  const returnBtn = document.getElementById("object-return-btn");
  const revealBtn = document.getElementById("object-reveal-btn");
  const imageWrap = document.getElementById("object-image-wrap");

  backdrop?.addEventListener("click", () => {
    hideObjectModal();
  });
  closeBtn?.addEventListener("click", () => {
    hideObjectModal();
  });
  returnBtn?.addEventListener("click", () => {
    hideObjectModal();
    resetGame();
  });

  revealBtn?.addEventListener("click", () => {
    if (!imageWrap) return;
    const imagePath = revealBtn.dataset.imagePath;
    const charName = revealBtn.dataset.charName || "";

    console.log("[object] reveal clicked", { charName, imagePath });

    revealBtn.classList.add("hidden");
    imageWrap.classList.remove("hidden");
    imageWrap.innerHTML = "";

    if (!imagePath) {
      const placeholder = document.createElement("div");
      placeholder.className = "object-image-placeholder";
      placeholder.innerText = "物件图片待更新";
      imageWrap.appendChild(placeholder);
      return;
    }

    const imageUrl = encodeURI(imagePath) + "?v=79";
    console.log("[object] loading image:", imageUrl);

    const img = document.createElement("img");
    img.src = imageUrl;
    img.alt = charName ? `${charName}的物件` : "物件";

    img.onload = () => {
      console.log("[object] image onload fired");
      console.log("[object] image natural size:", img.naturalWidth, "x", img.naturalHeight);
      console.log("[object] image wrap innerHTML length:", imageWrap.innerHTML.length);
    };
    img.onerror = (err) => {
      console.error("[object] image failed to load:", imageUrl, err);
      imageWrap.innerHTML = "";
      const placeholder = document.createElement("div");
      placeholder.className = "object-image-placeholder";
      placeholder.innerText = "物件图片加载失败";
      imageWrap.appendChild(placeholder);
    };

    imageWrap.innerHTML = "";
    imageWrap.appendChild(img);
    console.log("[object] img appended to DOM");
  });
}

function renderPostscript(scene) {
  if (postscriptTypingTimer) {
    clearInterval(postscriptTypingTimer);
    postscriptTypingTimer = null;
  }
  if (postscriptClickHandler) {
    sceneContent.removeEventListener("click", postscriptClickHandler);
    postscriptClickHandler = null;
  }

  sceneContent.innerHTML = "";
  sceneContent.classList.remove("postscript-source-reveal", "postscript-source-shown");
  choiceList.style.opacity = "0";
  choiceList.style.pointerEvents = "none";
  choiceList.style.transition = "opacity 1.2s ease";

  const text = scene.content || "";
  const chars = Array.from(text);
  let i = 0;
  const speed = 42;

  postscriptTypingTimer = setInterval(() => {
    if (i >= chars.length) {
      clearInterval(postscriptTypingTimer);
      postscriptTypingTimer = null;
      enablePostscriptSourceReveal(scene);
      choiceList.style.opacity = "1";
      choiceList.style.pointerEvents = "auto";
      return;
    }
    sceneContent.appendChild(document.createTextNode(chars[i]));
    i++;
  }, speed);
}

function enablePostscriptSourceReveal(scene) {
  sceneContent.classList.add("postscript-source-reveal");

  const hint = document.createElement("span");
  hint.className = "postscript-source-hint";
  hint.innerText = "点击显示跋原文";
  sceneContent.appendChild(document.createElement("br"));
  sceneContent.appendChild(hint);

  const urlParams = new URLSearchParams(window.location.search);
  if (urlParams.get("autoreveal") === "1") {
    setTimeout(() => sceneContent.click(), 1800);
  }

  postscriptClickHandler = () => {
    sceneContent.removeEventListener("click", postscriptClickHandler);
    postscriptClickHandler = null;
    sceneContent.classList.remove("postscript-source-reveal");
    sceneContent.classList.add("postscript-source-fading");

    setTimeout(() => {
      sceneContent.innerHTML = "";
      const sourceText = document.createElement("div");
      sourceText.className = "postscript-source-text";
      sourceText.innerText = "正在载入跋原文……";
      sceneContent.appendChild(sourceText);
      sceneContent.classList.remove("postscript-source-fading");
      sceneContent.classList.add("postscript-source-shown");

      fetch("postscript.txt?t=" + Date.now())
        .then((res) => res.text())
        .then((fullText) => {
          const paragraphs = fullText.trim().split(/\n+/).filter((p) => p.trim());
          sourceText.innerHTML = paragraphs.map((p) => `<p>${escapeHtml(p.trim())}</p>`).join("");
        })
        .catch(() => {
          sourceText.innerHTML = `<p>${escapeHtml(scene.source || "")}</p>`;
        });
    }, 600);
  };

  sceneContent.addEventListener("click", postscriptClickHandler);
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
initObjectModal();
