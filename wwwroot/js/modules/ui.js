// UI Module for Babylon.js Dungeon Crawler
window.DungeonCrawler = Object.assign(window.DungeonCrawler || {}, {
    initHUD: function () {
        const stack = new BABYLON.GUI.StackPanel(); stack.width = "250px"; stack.horizontalAlignment = 0; stack.verticalAlignment = 1; stack.left = "20px"; stack.top = "-20px";
        this.ui.addControl(stack);
        this.nameText = new BABYLON.GUI.TextBlock(); this.nameText.text = "LVL " + this.level + " - WARRIOR"; this.nameText.color = "white"; this.nameText.height = "30px"; this.nameText.textHorizontalAlignment = 0; stack.addControl(this.nameText);
        this.hBar = new BABYLON.GUI.Slider(); this.hBar.minimum = 0; this.hBar.maximum = this.maxHealth; this.hBar.value = this.maxHealth; this.hBar.height = "15px"; this.hBar.width = "200px"; this.hBar.color = "red"; this.hBar.background = "#333"; this.hBar.displayThumb = false; stack.addControl(this.hBar);
        this.xBar = new BABYLON.GUI.Slider(); this.xBar.minimum = 0; this.xBar.maximum = this.xpToNext; this.xBar.value = 0; this.xBar.height = "8px"; this.xBar.width = "200px"; this.xBar.color = "yellow"; this.xBar.background = "#222"; this.xBar.displayThumb = false; stack.addControl(this.xBar);
        this.goldText = new BABYLON.GUI.TextBlock(); this.goldText.text = "💰 " + this.gold; this.goldText.color = "#FFD700"; this.goldText.height = "40px"; this.goldText.textHorizontalAlignment = 0; stack.addControl(this.goldText);
        this.promptText = new BABYLON.GUI.TextBlock(); this.promptText.text = ""; this.promptText.color = "yellow"; this.promptText.fontSize = 24; this.ui.addControl(this.promptText);
        this.deathText = new BABYLON.GUI.TextBlock(); this.deathText.text = "YOU DIED"; this.deathText.color = "red"; this.deathText.fontSize = 80; this.deathText.isVisible = false; this.ui.addControl(this.deathText);
    },

    createHealthBar: function(m, offset = -100) {
        const r = new BABYLON.GUI.Rectangle(); r.width = "50px"; r.height = "8px"; r.background = "#444"; this.ui.addControl(r); r.linkWithMesh(m); r.linkOffsetY = offset; r.isVisible = false;
        const i = new BABYLON.GUI.Rectangle(); i.width = "100%"; i.height = "100%"; i.background = "red"; i.horizontalAlignment = 0; r.addControl(i); m.healthBarUI = i; m.healthContainerUI = r;
    },

    updateHUD: function () {
        this.hBar.maximum = this.maxHealth; this.hBar.value = this.player.health;
        this.xBar.maximum = this.xpToNext; this.xBar.value = this.xp;
        this.goldText.text = "💰 " + this.gold; this.nameText.text = "LVL " + this.level + " - WARRIOR (Floor " + this.currentLevel + ")";
        let p = "";
        this.chests.forEach(c => { if (BABYLON.Vector3.Distance(this.player.position, c.position) < 2 && !c.isOpen) p = "PRESS [E] TO OPEN CHEST"; });
        if (this.stairs && BABYLON.Vector3.Distance(this.player.position, this.stairs.position) < 3) p = "CLICK STAIRS TO DESCEND";
        this.promptText.text = p;
        if (this.player.health <= 0) { this.isDead = true; this.deathText.isVisible = true; setTimeout(() => { if (this.dotnetRef) this.dotnetRef.invokeMethodAsync("ToggleESCMenu"); }, 2000); }
    },

    showDescentDialog: function () {
        if (this.descentUI) return;
        const panel = new BABYLON.GUI.Rectangle(); panel.width = "300px"; panel.height = "150px"; panel.background = "rgba(0,0,0,0.8)"; panel.color = "#d4af37"; panel.thickness = 2; panel.cornerRadius = 10; this.ui.addControl(panel); this.descentUI = panel;
        const text = new BABYLON.GUI.TextBlock(); text.text = "DESCEND TO LEVEL " + (this.currentLevel + 1) + "?"; text.color = "white"; text.height = "40px"; text.top = "-30px"; panel.addControl(text);
        const btnYes = BABYLON.GUI.Button.CreateSimpleButton("yes", "YES"); btnYes.width = "80px"; btnYes.height = "40px"; btnYes.color = "white"; btnYes.background = "green"; btnYes.left = "-50px"; btnYes.top = "30px";
        btnYes.onPointerUpObservable.add(() => { panel.dispose(); this.descentUI = null; this.currentLevel++; this.saveGame(); this.showDamageText("DESCENDING...", this.player.position.clone(), "cyan"); setTimeout(() => this.init(this.canvas.id, this.dotnetRef), 1000); });
        panel.addControl(btnYes);
        const btnNo = BABYLON.GUI.Button.CreateSimpleButton("no", "NO"); btnNo.width = "80px"; btnNo.height = "40px"; btnNo.color = "white"; btnNo.background = "red"; btnNo.left = "50px"; btnNo.top = "30px";
        btnNo.onPointerUpObservable.add(() => { panel.dispose(); this.descentUI = null; });
        panel.addControl(btnNo);
    },

    showDamageText: function (t, p, c = "white") {
        const txt = new BABYLON.GUI.TextBlock(); txt.text = t; txt.color = c; txt.fontSize = 20; this.ui.addControl(txt);
        const loop = setInterval(() => {
            const proj = BABYLON.Vector3.Project(p.add(new BABYLON.Vector3(0,2,0)), BABYLON.Matrix.Identity(), this.scene.getTransformMatrix(), this.camera.viewport.toGlobal(this.engine.getRenderWidth(), this.engine.getRenderHeight()));
            txt.left = proj.x - this.engine.getRenderWidth()/2; txt.top = proj.y - this.engine.getRenderHeight()/2;
            txt.alpha = (txt.alpha || 1) - 0.02; txt.top -= 1; if (txt.alpha <= 0) { clearInterval(loop); txt.dispose(); }
        }, 20);
    }
});
