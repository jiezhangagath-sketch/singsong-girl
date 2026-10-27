"""验证物件弹窗：进入跋场景 → 获取物件 → 收获物件（出图）"""
import asyncio
import sys
from playwright.async_api import async_playwright

SCENE = sys.argv[1] if len(sys.argv) > 1 else "xh_postscript"

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(channel="chrome")
        page = await browser.new_page(viewport={"width": 1280, "height": 800})
        errors = []
        page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
        page.on("pageerror", lambda e: errors.append(str(e)))
        await page.goto("http://localhost:8090/index.html")
        await page.wait_for_function(
            "typeof storyData !== 'undefined' && storyData !== null", timeout=10000
        )
        await page.evaluate(f"currentSceneId = '{SCENE}'; renderScene();")
        await page.wait_for_timeout(4500)
        # 点“获取物件”
        await page.click("text=获取物件")
        await page.wait_for_timeout(600)
        await page.screenshot(path="/tmp/obj_text.png")
        # 点“收获物件”出图
        await page.click("#object-reveal-btn")
        await page.wait_for_timeout(1500)
        await page.screenshot(path="/tmp/obj_image.png")
        print("console errors:", errors if errors else "none")
        await browser.close()

asyncio.run(main())
