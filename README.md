# 《海上花》互动体验游戏

这是一个基于网页的互动体验游戏原型。你可以从《海上花》小说中选择不同角色，体验不同剧情分支。

当前示例已根据 `novel.txt` 的实际文本人物与前十回情节搭建互动：赵朴斋、洪善卿、张小村、陆秀宝、王阿二等角色。

## 目录结构

- `index.html` - 游戏页面主入口
- `style.css` - 样式文件
- `script.js` - 游戏交互逻辑
- `data/story.json` - 故事场景与选项配置
- `scripts/segment_text.py` - 文本分段辅助脚本
- `.vscode/tasks.json` - 启动本地服务器任务

## 运行方式

建议通过本地服务器运行，因为 `fetch` 需要通过 HTTP 加载 JSON 文件。

```bash
cd "Singsong Girl"
python3 -m http.server 8080
```

然后在浏览器中打开：

[http://localhost:8080](http://localhost:8080)

> ⚠️ **注意**：不要直接双击打开 `index.html` 文件（即通过 `file://` 协议访问），否则浏览器会阻止加载 `data/story.json`。必须通过上述 HTTP 服务器方式访问。

## 游戏数据格式

`data/story.json` 使用 JSON 配置故事结构，主要字段如下：

- `characters`：角色列表，每个角色包含 `id`、`name`、`description`
- `startScene`：游戏起始场景 ID
- `scenes`：场景列表，每个场景包含 `id`、`title`、`content`、`choices`
- `choices`：每个选项包含：
  - `text`：按钮显示文字
  - `nextScene`：下一个场景 ID
  - `character`：可选字段，用于选择当前角色

### 示例场景配置

```json
{
  "id": "intro",
  "title": "序章：海上花初遇",
  "content": "你将进入《海上花》的世界...",
  "choices": [
    {
      "text": "以陈白露的视角开始",
      "nextScene": "chen_start",
      "character": "chen"
    }
  ]
}
```

## 如何组织小说文本

如果你的原始文本还没有分段，可以先使用 `scripts/segment_text.py` 将文本按段落分割，得到清晰的片段。

1. 将《海上花》文本保存为 `novel.txt`
2. 运行：

```bash
python3 scripts/segment_text.py novel.txt
```

脚本会按段落输出序号和内容，方便你手动映射为游戏场景。

## 下一步建议

1. 从小说中选取 8-12 个关键场景
2. 为每个角色设计对应的分支节点
3. 将场景内容填充到 `data/story.json`
4. 继续扩展角色属性、结果结局、以及视觉表现
