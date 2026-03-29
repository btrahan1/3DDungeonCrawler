// UI Module for Babylon.js Dungeon Crawler
window.DungeonCrawler = Object.assign(window.DungeonCrawler || {}, {
    initHUD: function () {
        const stack = new BABYLON.GUI.StackPanel(); stack.width = "250px"; stack.horizontalAlignment = 0; stack.verticalAlignment = 1; stack.left = "20px"; stack.top = "-20px";
        this.ui.addControl(stack);
        this.nameText = new BABYLON.GUI.TextBlock(); this.nameText.text = "LVL " + this.level + " - " + this.playerClass; this.nameText.color = "white"; this.nameText.height = "35px"; this.nameText.fontSize = 18; this.nameText.textHorizontalAlignment = 0; this.nameText.fontFamily = "MedievalSharp"; stack.addControl(this.nameText);
        
        this.abilityStack = new BABYLON.GUI.StackPanel(); this.abilityStack.width = "100%"; this.abilityStack.horizontalAlignment = 0;
        stack.addControl(this.abilityStack);
        this.refreshAbilityButtons();
        
        const createBar = (name, color, h, max) => {
            const container = new BABYLON.GUI.StackPanel(); container.isVertical = false; container.height = h + "px"; container.width = "200px"; container.horizontalAlignment = 0;
            const label = new BABYLON.GUI.TextBlock(); label.text = name; label.color = "white"; label.width = "40px"; label.fontSize = 12; label.fontFamily = "MedievalSharp"; container.addControl(label);
            const slider = new BABYLON.GUI.Slider(); slider.minimum = 0; slider.maximum = max; slider.value = max; slider.height = (h-4) + "px"; slider.width = "160px"; slider.color = color; slider.background = "#222"; slider.displayThumb = false; slider.borderColor = "#444"; slider.isReadOnly = true; container.addControl(slider);
            stack.addControl(container); return slider;
        };

        this.hBar = createBar("HP", "#cd1d1d", 22, this.maxHealth);
        this.sBar = createBar("STA", "#d4af37", 18, 100);
        this.mBar = createBar("MP", "#1e90ff", 18, 100);
        this.xBar = createBar("XP", "#32cd32", 12, this.xpToNext);
        this.xBar.value = 0;

        this.goldText = new BABYLON.GUI.TextBlock(); this.goldText.text = "💰 " + this.gold; this.goldText.color = "#FFD700"; this.goldText.height = "40px"; this.goldText.fontSize = 20; this.goldText.textHorizontalAlignment = 0; this.goldText.fontFamily = "MedievalSharp"; stack.addControl(this.goldText);
        this.promptText = new BABYLON.GUI.TextBlock(); this.promptText.text = ""; this.promptText.color = "yellow"; this.promptText.fontSize = 24; this.promptText.fontFamily = "MedievalSharp"; this.ui.addControl(this.promptText);
        this.deathText = new BABYLON.GUI.TextBlock(); this.deathText.text = "YOU DIED"; this.deathText.color = "red"; this.deathText.fontSize = 80; this.deathText.fontFamily = "Almendra SC"; this.deathText.isVisible = false; this.ui.addControl(this.deathText);
        
        const potionStack = new BABYLON.GUI.StackPanel();
        potionStack.isVertical = false;
        potionStack.height = "45px";
        potionStack.width = "200px";
        potionStack.horizontalAlignment = 0;
        potionStack.top = "5px";
        stack.addControl(potionStack);

        const createPotionIcon = (key, color) => {
            const container = new BABYLON.GUI.Rectangle();
            container.width = "40px"; container.height = "45px"; container.thickness = 0; container.paddingRight = "8px";
            
            const bottle = new BABYLON.GUI.Ellipse();
            bottle.width = "30px"; bottle.height = "30px"; bottle.background = color; bottle.thickness = 2; bottle.color = "white";
            bottle.shadowBlur = 5; bottle.shadowColor = "black";
            container.addControl(bottle);

            const countText = new BABYLON.GUI.TextBlock();
            countText.text = "0"; countText.color = "white"; countText.fontSize = 14; countText.fontWeight = "bold";
            bottle.addControl(countText);

            const keyLabel = new BABYLON.GUI.TextBlock();
            keyLabel.text = key; keyLabel.color = "#ccc"; keyLabel.fontSize = 10; keyLabel.verticalAlignment = 1; keyLabel.top = "15px"; keyLabel.fontFamily = "MedievalSharp";
            container.addControl(keyLabel);

            potionStack.addControl(container);
            return countText;
        };

        this.hpPotionCount = createPotionIcon("1", "#cd1d1d");
        this.stPotionCount = createPotionIcon("2", "#d4af37");
        this.mpPotionCount = createPotionIcon("3", "#1e90ff");
        this.rePotionCount = createPotionIcon("4", "#9932cc");
        
        this.initAutoToggle();
    },

    createHealthBar: function(m, offset = -100) {
        const r = new BABYLON.GUI.Rectangle(); r.width = "50px"; r.height = "8px"; r.background = "#444"; this.ui.addControl(r); r.linkWithMesh(m); r.linkOffsetY = offset; r.isVisible = false;
        const i = new BABYLON.GUI.Rectangle(); i.width = "100%"; i.height = "100%"; i.background = "red"; i.horizontalAlignment = 0; r.addControl(i); m.healthBarUI = i; m.healthContainerUI = r;
    },

    updateHUD: function () {
        this.hBar.maximum = this.maxHealth; this.hBar.value = this.player.health;
        this.sBar.maximum = this.maxStamina || 100; this.sBar.value = this.stamina;
        this.mBar.maximum = this.maxMana || 100; this.mBar.value = this.mana;
        this.xBar.maximum = this.xpToNext; this.xBar.value = this.xp;
        this.goldText.text = "💰 " + this.gold; this.nameText.text = "LVL " + this.level + " - " + this.playerClass + " (Floor " + this.currentLevel + ")";
        this.hpPotionCount.text = this.potions.hp.toString();
        this.stPotionCount.text = this.potions.st.toString();
        this.mpPotionCount.text = this.potions.mp.toString();
        this.rePotionCount.text = this.potions.rest.toString();
        let p = "";
        this.chests.forEach(c => { if (BABYLON.Vector3.Distance(this.player.position, c.position) < 2 && !c.isOpen) p = "PRESS [E] TO OPEN CHEST"; });
        if (this.stairs && BABYLON.Vector3.Distance(this.player.position, this.stairs.position) < 3) p = "CLICK STAIRS TO DESCEND";
        if (this.isAutoPlayActive && !p) p = "AUTO-PLAY ACTIVE: " + (this.autoPlayTarget ? (this.autoPlayTarget.isNPC ? "TARGETING ENEMY" : "TARGETING CHEST") : "SEARCHING...");
        this.promptText.text = p;
        if (this.player.health <= 0) { this.isDead = true; this.deathText.isVisible = true; setTimeout(() => { if (this.dotnetRef) this.dotnetRef.invokeMethodAsync("ToggleESCMenu"); }, 2000); }
    },

    showDescentDialog: function () {
        if (this.descentUI) return;
        const panel = new BABYLON.GUI.Rectangle(); panel.width = "300px"; panel.height = "150px"; panel.background = "rgba(0,0,0,0.8)"; panel.color = "#d4af37"; panel.thickness = 2; panel.cornerRadius = 10; this.ui.addControl(panel); this.descentUI = panel;
        const text = new BABYLON.GUI.TextBlock(); text.text = "DESCEND TO LEVEL " + (this.currentLevel + 1) + "?"; text.color = "white"; text.height = "40px"; text.top = "-30px"; panel.addControl(text);
        const btnYes = BABYLON.GUI.Button.CreateSimpleButton("yes", "YES"); btnYes.width = "80px"; btnYes.height = "40px"; btnYes.color = "white"; btnYes.background = "green"; btnYes.left = "-50px"; btnYes.top = "30px";
        btnYes.onPointerUpObservable.add(async () => { 
            panel.dispose(); this.descentUI = null; 
            this.showDamageText("DESCENDING...", this.player.position.clone(), "cyan"); 
            if (this.dotnetRef) await this.dotnetRef.invokeMethodAsync("DescendFloor");
            setTimeout(() => this.init(this.canvas.id, this.dotnetRef, this.lastState), 1000); 
        });
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
    },

    refreshAbilityButtons: function() {
        if (!this.abilityStack) return;
        this.abilityStack.clearControls();
        const createBtn = (text, key, color, action) => {
            const btn = BABYLON.GUI.Button.CreateSimpleButton("btn" + key, `${text} (${key})`);
            btn.width = "140px"; btn.height = "35px"; btn.color = "white"; btn.background = color;
            btn.fontFamily = "MedievalSharp"; btn.cornerRadius = 5; btn.thickness = 2; btn.paddingBottom = "5px"; btn.horizontalAlignment = 0;
            btn.onPointerUpObservable.add(() => action());
            this.abilityStack.addControl(btn);
        };

        if (this.learnedAbilities.includes("Heal") || this.playerClass === "HEALER") {
            createBtn("HEAL", "Q", "#2e7d32", () => this.handleHealSpell());
        }
        if (this.learnedAbilities.includes("Power Strike")) {
            createBtn("STRIKE", "R", "#8b4513", () => this.handlePowerStrike());
        }
        if (this.learnedAbilities.includes("Shield")) {
            createBtn("SHIELD", "F", "#4682b4", () => this.handleShieldSpell());
        }
    },

    initAutoToggle: function() {
        if (this.autoToggleContainer) this.autoToggleContainer.dispose();
        
        const autoStack = new BABYLON.GUI.StackPanel(); 
        autoStack.width = "160px"; autoStack.height = "60px";
        autoStack.horizontalAlignment = BABYLON.GUI.Control.HORIZONTAL_ALIGNMENT_RIGHT; 
        autoStack.verticalAlignment = BABYLON.GUI.Control.VERTICAL_ALIGNMENT_TOP; 
        autoStack.top = "20px"; autoStack.right = "-20px";
        this.ui.addControl(autoStack);
        this.autoToggleContainer = autoStack;

        const autoBtn = BABYLON.GUI.Button.CreateSimpleButton("btnAuto", this.isAutoPlayActive ? "AUTO: ON [P]" : "AUTO-PLAY [P]");
        autoBtn.width = "140px"; autoBtn.height = "40px"; autoBtn.color = "white"; 
        autoBtn.background = this.isAutoPlayActive ? "#ffa500" : "#444";
        autoBtn.fontFamily = "MedievalSharp"; autoBtn.cornerRadius = 8; autoBtn.thickness = 3;
        autoBtn.isPointerBlocker = true;
        
        autoBtn.onPointerDownObservable.add(() => {
            this.isAutoPlayActive = !this.isAutoPlayActive;
            console.log("Auto-Play Toggled (Button):", this.isAutoPlayActive);
            const label = this.isAutoPlayActive ? "AUTO: ON [P]" : "AUTO-PLAY [P]";
            if (autoBtn.textBlock) autoBtn.textBlock.text = label;
            autoBtn.background = this.isAutoPlayActive ? "#ffa500" : "#444";
            if (!this.isAutoPlayActive) { 
                this.autoPlayTarget = null; this.autoPlayPath = []; 
                this.promptText.text = "";
            }
        });
        autoStack.addControl(autoBtn);
    }
});
