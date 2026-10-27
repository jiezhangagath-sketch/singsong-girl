"""自动跑通沈小红线：序幕选角 → 逐节点点击 → 跋，记录链路与截图"""
import asyncio
from playwright.async_api import async_playwright

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(channel="chrome")
        page = await browser.new_page(viewport={"width": 1280, "height": 800})
        errors = []
        page.on("pageerror", lambda e: errors.append(str(e)))
        await page.goto("http://localhost:8090/index.html")
        await page.wait_for_function(
            "typeof storyData !== 'undefined' && storyData !== null", timeout=10000
        )
        await page.wait_for_timeout(2500)  # 序幕动画

        # 选角：沈小红（主角色，直接点击）
        await page.click(".character-select-card:has(.character-select-name:text-is(\"沈小红\"))", timeout=8000)
        await page.wait_for_timeout(1200)
        # 关系网界面 → 进入剧情
        enter = await page.query_selector("text=进入剧情")
        if enter:
            await enter.click()
        await page.wait_for_timeout(800)

        chain = []
        for step in range(20):
            sid = await page.evaluate("currentSceneId")
            title = await page.evaluate(
                "document.querySelector('#scene-header h2')?.innerText || ''"
            )
            chain.append(f"{sid} | {title}")
            if sid.endswith("_postscript"):
                break
            # 点击第一个选项
            btns = await page.query_selector_all("#choice-list .choice-button")
            if not btns:
                chain.append("!! 无选项，链断裂")
                break
            await btns[0].click()
            await page.wait_for_timeout(900)

        print("链路:")
        for c in chain:
            print(" ", c)
        print("page errors:", errors if errors else "none")

        # 跋云幕应已打开
        await page.wait_for_timeout(3500)
        await page.screenshot(path="/tmp/xh_run_postscript.png")
        print("postscript screenshot saved")
        await browser.close()

asyncio.run(main())
