"""快速验证指定场景渲染"""
import asyncio
import sys
from playwright.async_api import async_playwright

SCENES = sys.argv[1:] or ["xh_ch24_scene1"]

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
        for sc in SCENES:
            await page.evaluate(f"currentSceneId = '{sc}'; renderScene();")
            await page.wait_for_timeout(700)
            await page.screenshot(path=f"/tmp/scene_{sc}.png")
        print("page errors:", errors if errors else "none")
        await browser.close()

asyncio.run(main())
