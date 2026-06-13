# 全局关系网重构计划

## 目标
将关系网从"按角色的独立星形网络"重构为"全局统一网络"：
1. 所有人物在同一张关系网中显示
2. 选中角色居中，点击其他节点可切换中心
3. 只绘制中心角色与直接邻居的连线，间接关系不画线
4. 新增角色暂不设置头像（删除占位图）

## 数据层修改

### relationships.json 结构变更
从按角色的星形网络改为全局 nodes + edges：

```json
{
  "nodes": [
    { "id": "zhaopuzhai", "name": "赵朴斋" },
    ...
  ],
  "edges": [
    { "source": "zhaopuzhai", "target": "hongshanqing", "relation": "亲戚" },
    ...
  ]
}
```

**节点提取**：从现有 8 个 network 的 center + nodes 去重提取，共约 39 个节点。

**边提取规则**：
- 遍历每个 network，center 与每个 node 之间形成一条无向边
- 去掉王莲生-小柳儿的边（用户明确为间接关系，无直接联络）
- 统一 silaoye（四老爷）和 lishifu（李实夫）为 lishifu
- 每条边只保留一次（去重）

## 渲染层修改（script.js）

### renderRelationshipNetwork(centerId) 重构

**布局算法**：
- SVG viewBox: 0 0 760 760（比原来 460 增大）
- 中心: (380, 380)
- 中心节点半径: 44
- 直接邻居环: r=210，节点半径 28
- 间接节点环: r=340，节点半径 20
- 直接邻居均匀分布在内环
- 间接节点均匀分布在外环（角度偏移避免与内环对齐）

**绘制规则**：
- 只绘制中心到直接邻居的二次贝塞尔曲线
- 连线上标注 relation 标签
- 直接邻居节点下方显示 label（从旧数据中提取）
- 间接节点只显示名字，不显示 label

**交互**：
- 点击任何节点（包括间接节点）：该节点成为新中心，重新渲染整个网络
- 节点 hover 效果：放大、变色
- 过渡动画：整个 SVG 容器 fade-in（保持现有 stagger 节点入场动画）

**按钮**：
- "返回选择"：返回序幕角色网格
- "进入剧情"：进入当前中心角色的剧情线

### 辅助函数
- `getCharacterChoice(charId)`：根据角色 ID 从 intro choices 中找到对应的 choice 对象
- `getDirectNeighbors(centerId)`：从 edges 中查找与 centerId 相连的所有节点
- `calculateLayout(centerId)`：计算所有节点的位置

## UI 层修改（style.css）

- `.network-svg`：max-width 从 460px 增大到 580px
- `.network-node-outer`：保持现有样式，直接邻居使用
- 新增 `.network-node-indirect`：间接节点样式（更小、更淡）
- 新增 `.network-node-indirect-text`：间接节点文字样式
- `.network-label-text`：只对直接邻居显示

## 其他修改

- 删除 `images/赵二宝.png` 和 `images/李鹤汀.png` 占位图
- `index.html` 版本号 v=10 → v=11

## 实现步骤

1. 用 Python 脚本转换 relationships.json 数据结构
2. 修改 script.js 中的 renderRelationshipNetwork 函数
3. 调整 style.css 中的关系网样式
4. 删除占位头像
5. 验证 JSON 语法和场景链
6. 本地服务器测试
