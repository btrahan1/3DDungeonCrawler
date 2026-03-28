window.DungeonCrawler = {
    canvas: null, engine: null, scene: null, camera: null, player: null, ui: null,
    inputMap: {}, entities: [], chests: [], stairs: null,
    dungeonSize: 60, gridSize: 2.5, currentLevel: 1, dotnetRef: null,
    isTransitioning: false, isDead: false,
    xp: 0, level: 1, xpToNext: 100, gold: 0, maxHealth: 100, bonusDmg: 0,
    equipment: {}, inventory: [],

    init: async function (canvasId, dotnetRef, savedData) {
        if (this.engine) {
            this.entities.forEach(e => { if (e.healthContainerUI) e.healthContainerUI.dispose(); });
            this.scene.dispose();
            this.entities = []; this.chests = []; this.stairs = null;
        }

        if (savedData) {
            this.xp = savedData.xp || 0;
            this.level = savedData.level || 1;
            this.gold = savedData.gold || 0;
            this.currentLevel = savedData.currentLevel || 1;
            this.maxHealth = savedData.maxHealth || 100;
            this.bonusDmg = savedData.bonusDmg || 0;
            this.equipment = savedData.equipment || {};
            this.inventory = savedData.inventory || [];
            this.xpToNext = this.level * 100;
        } else if (!this.engine) {
            this.xp = 0; this.level = 1; this.gold = 0; this.currentLevel = 1; this.maxHealth = 100; this.bonusDmg = 0; this.xpToNext = 100; this.equipment = {}; this.inventory = [];
        }

        this.isTransitioning = false; this.isDead = false;
        this.dotnetRef = dotnetRef; this.canvas = document.getElementById(canvasId);
        if (!this.engine) { this.engine = new BABYLON.Engine(this.canvas, true); window.addEventListener("resize", () => this.engine.resize()); }
        
        this.scene = new BABYLON.Scene(this.engine);
        this.scene.clearColor = new BABYLON.Color4(0.01, 0.01, 0.02, 1);
        this.scene.collisionsEnabled = true;

        this.camera = new BABYLON.ArcRotateCamera("camera", -Math.PI / 2, Math.PI / 3, 15, BABYLON.Vector3.Zero(), this.scene);
        this.camera.attachControl(this.canvas, true);
        this.camera.lowerRadiusLimit = 5; this.camera.upperRadiusLimit = 80;

        const hemi = new BABYLON.HemisphericLight("hemi", new BABYLON.Vector3(0, 1, 0), this.scene);
        hemi.intensity = 0.4;
        const dir = new BABYLON.DirectionalLight("dir", new BABYLON.Vector3(-1, -2, -1), this.scene);
        dir.position = new BABYLON.Vector3(20, 40, 20);
        const shadowGen = new BABYLON.ShadowGenerator(1024, dir);
        shadowGen.useBlurExponentialShadowMap = true;

        this.ui = BABYLON.GUI.AdvancedDynamicTexture.CreateFullscreenUI("UI");
        this.initHUD();

        this.scene.onKeyboardObservable.add((kbInfo) => {
            const key = kbInfo.event.key.toLowerCase();
            if (kbInfo.type === BABYLON.KeyboardEventTypes.KEYDOWN) {
                this.inputMap[key] = true;
                if (key === " " && !this.isDead) this.handlePlayerAttack();
                if (key === "e" && !this.isDead) this.handleInteractions();
                if (key === "escape") {
                    if (this.dotnetRef) this.dotnetRef.invokeMethodAsync("OnPause");
                    this.inputMap["escape"] = false;
                }
            } else { this.inputMap[key] = false; }
        });

        this.scene.onPointerDown = (evt, pickResult) => {
            if (pickResult.hit && pickResult.pickedMesh) {
                let m = pickResult.pickedMesh; while (m.parent && !m.isStairs) m = m.parent;
                if (m.isStairs && BABYLON.Vector3.Distance(this.player.position, m.position) < 4.0) this.showDescentDialog();
            }
        };

        const dungeonData = this.generateDungeon(this.dungeonSize, this.dungeonSize);
        this.renderDungeon(dungeonData.grid, shadowGen, dungeonData.bossRoom);

        if (dungeonData.bossRoom) {
            const br = dungeonData.bossRoom;
            const bLight = new BABYLON.PointLight("bossLight", new BABYLON.Vector3((br.x + br.w/2) * this.gridSize, 2, (br.y + br.h/2) * this.gridSize), this.scene);
            bLight.diffuse = new BABYLON.Color3(0.8, 0.1, 0.1); bLight.intensity = 1.0; bLight.range = 15;
        }

        try {
            const res = await fetch('data/Player.json');
            const equip = this.equipment || {};
            const eMap = {
                head: equip.head?.modelPath,
                chest: equip.chest?.modelPath,
                hands: equip.hands?.modelPath,
                legs: equip.legs?.modelPath,
                feet: equip.feet?.modelPath,
                right: equip.rightHand?.modelPath || 'data/sword.json',
                left: equip.leftHand?.modelPath || 'data/shield.json'
            };
            this.player = await this.loadVoxelModel(await res.json(), shadowGen, eMap);
            this.player.health = this.maxHealth;
            this.player.position = new BABYLON.Vector3(dungeonData.rooms[0].x * this.gridSize, 0.1, dungeonData.rooms[0].y * this.gridSize);
            this.camera.setTarget(this.player);
        } catch (e) { console.error(e); }

        for (let i = 1; i < dungeonData.rooms.length; i++) {
            const room = dungeonData.rooms[i];
            const isBossRoom = (i === dungeonData.rooms.length - 1);
            
            if (!isBossRoom && Math.random() > 0.6) continue;
            
            const isG = Math.random() > 0.4;
            const resN = await fetch(isG ? 'data/goblin.json' : 'data/orc.json');
            const eMap = isG ? { right: 'data/axe.json' } : { right: 'data/mace.json' };
            const npc = await this.loadVoxelModel(await resN.json(), shadowGen, eMap);
            
            npc.position = new BABYLON.Vector3((room.x+room.w/2)*this.gridSize, 0.1, (room.y+room.h/2)*this.gridSize);
            
            if (isBossRoom) {
                npc.scaling.set(2.25, 2.25, 2.25);
                npc.health = (isG ? 100 : 200) + (this.currentLevel * 20);
                npc.isBoss = true;
            } else {
                npc.health = isG ? 30 : 60;
            }
            
            npc.maxHealth = npc.health; npc.isNPC = true; this.entities.push(npc); this.createHealthBar(npc, isBossRoom ? -150 : -100);
            
            if (!isBossRoom && Math.random() > 0.5) {
                const chest = await this.loadProp('data/chest.json', shadowGen);
                chest.position = new BABYLON.Vector3((room.x+1)*this.gridSize, 0, (room.y+1)*this.gridSize);
                chest.isChest = true; this.chests.push(chest);
            }
        }

        const lastRoom = dungeonData.rooms[dungeonData.rooms.length - 1];
        this.stairs = await this.loadProp('data/stairs.json', shadowGen);
        this.stairs.position = new BABYLON.Vector3((lastRoom.x + lastRoom.w - 1.5) * this.gridSize, 0, (lastRoom.y + lastRoom.h - 1.5) * this.gridSize);
        this.stairs.isStairs = true;

        if (this.engine) this.engine.stopRenderLoop();
        this.engine.runRenderLoop(() => {
            if (this.player && !this.scene.isPaused && !this.isDead) {
                this.handlePlayerMovement();
                this.handleNPCMovement();
                this.updateAnimations();
                this.updateHUD();
            }
            this.scene.render();
        });
    },

    updateEquipment: function(equipData) {
        if (equipData) {
            this.equipment = equipData;
            console.log("Equipment updated in engine:", this.equipment);
        }
    },

    saveGame: function() {
        const data = { 
            level: this.level, xp: this.xp, gold: this.gold, 
            currentLevel: this.currentLevel, maxHealth: this.maxHealth,
            bonusDmg: this.bonusDmg, equipment: this.equipment || {}, inventory: this.inventory || []
        };
        localStorage.setItem("dungeonSave", JSON.stringify(data));
    },

    initPortrait: async function (canvasId, savedData) {
        const canvas = document.getElementById(canvasId);
        if(!canvas) return;
        const engine = new BABYLON.Engine(canvas, true);
        const scene = new BABYLON.Scene(engine);
        scene.clearColor = new BABYLON.Color4(0.05, 0.05, 0.08, 1);
        const camera = new BABYLON.ArcRotateCamera("pCam", -Math.PI / 2, Math.PI / 2.5, 4, new BABYLON.Vector3(0, 1.2, 0), scene);
        camera.lowerRadiusLimit = camera.upperRadiusLimit = 4;
        new BABYLON.HemisphericLight("pLight", new BABYLON.Vector3(0, 1, 0), scene);
        const pLight = new BABYLON.PointLight("pLight2", new BABYLON.Vector3(2, 2, 2), scene); pLight.intensity = 0.8;

        try {
            const res = await fetch('data/Player.json');
            const equip = savedData.equipment || {};
            const eMap = {
                head: equip.head?.modelPath, chest: equip.chest?.modelPath, hands: equip.hands?.modelPath,
                legs: equip.legs?.modelPath, feet: equip.feet?.modelPath,
                right: equip.rightHand?.modelPath || 'data/sword.json',
                left: equip.leftHand?.modelPath || 'data/shield.json'
            };
            const model = await this.loadVoxelModel(await res.json(), null, eMap, scene);
            model.rotation.y = Math.PI;
        } catch (e) { console.error(e); }

        engine.runRenderLoop(() => { scene.render(); });
        window.addEventListener("resize", () => engine.resize());
        return { engine, scene };
    },

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

    performSwing: function (entity) {
        if (entity.isSwinging) return;
        entity.isSwinging = true; const arm = entity.userData.armR;
        const anim = new BABYLON.Animation("sw", "rotation.x", 60, 0, 0); anim.setKeys([{frame:0, value:0}, {frame:10, value:1.5}, {frame:20, value:0}]);
        arm.animations = [anim]; this.scene.beginAnimation(arm, 0, 20, false, 1.5, () => entity.isSwinging = false);
    },

    handlePlayerAttack: function () {
        if (this.player.isSwinging) return;
        this.performSwing(this.player);
        
        let weaponPower = 0;
        if (this.equipment.rightHand && this.equipment.rightHand.power) weaponPower = this.equipment.rightHand.power;
        
        const dmg = 15 + (this.level * 2) + this.bonusDmg + (weaponPower * 5);
        setTimeout(() => {
            this.entities.forEach(n => {
                if (BABYLON.Vector3.Distance(this.player.position, n.position) < 3 && BABYLON.Vector3.Dot(this.player.forward, n.position.subtract(this.player.position).normalize()) > 0.5) {
                    n.health -= dmg; n.healthContainerUI.isVisible = true; n.healthBarUI.width = (n.health/n.maxHealth*100) + "%";
                    n.moveWithCollisions(n.position.subtract(this.player.position).normalize().scale(0.6)); this.showDamageText("-" + dmg, n.position.clone(), "white");
                    if (n.health <= 0) {
                        if (n.isBoss) this.spawnBossChest(n.position.clone());
                        this.addXP(n.isBoss ? 150 : (n.maxHealth > 40 ? 40 : 15));
                        this.entities = this.entities.filter(e => e !== n);
                        n.healthContainerUI.dispose(); n.dispose();
                    }
                }
            });
        }, 150);
    },

    addXP: function (amount) {
        this.xp += amount; this.showDamageText("+" + amount + " XP", this.player.position.clone(), "yellow");
        if (this.xp >= this.xpToNext) { this.level++; this.xp -= this.xpToNext; this.xpToNext = this.level * 100; this.maxHealth += 10; this.player.health = this.maxHealth; this.showDamageText("LEVEL UP!", this.player.position.clone(), "gold"); }
        this.saveGame();
    },

    handleNPCMovement: function () {
        const now = Date.now();
        this.entities.forEach(n => {
            const ai = n.userData.ai;
            const dist = BABYLON.Vector3.Distance(n.position, this.player.position);
            
            // Aggro & Chase Logic
            if (dist < 12.0) {
                // Smoothly Rotate towards player
                const targetRotation = Math.atan2(this.player.position.x - n.position.x, this.player.position.z - n.position.z);
                n.rotation.y = BABYLON.Scalar.LerpAngle(n.rotation.y, targetRotation, 0.1);
                
                if (dist > 2.01) {
                    // Chase if further than melee range
                    n.isMoving = true;
                    let moveDir = n.forward.clone();
                    
                    // Wall Recovery: If stuck, try sliding sideways
                    if (ai.lastPos && BABYLON.Vector3.Distance(n.position, ai.lastPos) < 0.005) {
                        ai.stuckCount++;
                        if (ai.stuckCount > 10) {
                            // Pivot move direction by 45 degrees to find a clear path
                            const pivot = (n.uniqueId % 2 === 0 ? 1 : -1) * Math.PI / 4;
                            moveDir = new BABYLON.Vector3(
                                Math.sin(n.rotation.y + pivot),
                                0,
                                Math.cos(n.rotation.y + pivot)
                            );
                        }
                    } else {
                        ai.stuckCount = 0;
                    }
                    ai.lastPos = n.position.clone();
                    n.moveWithCollisions(moveDir.scale(n.isBoss ? 0.08 : 0.06));
                } else {
                    n.isMoving = false;
                    // Attack if in melee range
                    if (now - (ai.lastAtk || 0) > 2500) {
                        this.performSwing(n); ai.lastAtk = now;
                        setTimeout(() => {
                            if (BABYLON.Vector3.Distance(n.position, this.player.position) < 2.5) {
                                let armorPower = 0;
                                const slots = ["head", "chest", "hands", "legs", "feet", "leftHand"];
                                slots.forEach(s => { if (this.equipment[s] && this.equipment[s].power) armorPower += this.equipment[s].power; });
                                
                                const baseDmg = (n.isBoss ? this.currentLevel * 3 : this.currentLevel) + Math.floor(this.currentLevel/2) + 5;
                                const dmg = Math.max(1, baseDmg - armorPower);

                                this.player.health -= dmg; this.showDamageText("-" + dmg, this.player.position.clone(), "red");
                            }
                        }, 250);
                    }
                }
            } else {
                // Wandering Logic
                if (!ai.target) {
                    if (ai.idle > 0) { ai.idle--; n.isMoving = false; }
                    else { ai.target = new BABYLON.Vector3(n.position.x + (Math.random()-0.5)*10, 0, n.position.z + (Math.random()-0.5)*10); ai.lastPos = n.position.clone(); ai.stuckCount = 0; }
                } else {
                    const diff = ai.target.subtract(n.position);
                    if (diff.length() < 0.5) { ai.target = null; ai.idle = 50 + Math.random()*100; }
                    else {
                        if (ai.lastPos && BABYLON.Vector3.Distance(n.position, ai.lastPos) < 0.005) {
                            ai.stuckCount++;
                            if (ai.stuckCount > 30) { ai.target = null; ai.idle = 10; return; }
                        } else ai.stuckCount = 0;
                        ai.lastPos = n.position.clone();
                        n.rotation.y = BABYLON.Scalar.LerpAngle(n.rotation.y, Math.atan2(diff.x, diff.z), 0.1);
                        n.moveWithCollisions(n.forward.scale(0.04));
                        n.isMoving = true;
                    }
                }
            }
        });
    },

    handleInteractions: function () {
        this.chests.forEach(c => {
            if (BABYLON.Vector3.Distance(this.player.position, c.position) < 2 && !c.isOpen) {
                c.isOpen = true;
                if (c.isBossChest && this.dotnetRef) {
                    this.dotnetRef.invokeMethodAsync("ClaimBossLoot", this.currentLevel);
                } else {
                    const lootGold = Math.floor(Math.random() * 30) + 20 * this.currentLevel;
                    this.gold += lootGold; this.saveGame(); this.showDamageText("+" + lootGold + " GOLD", c.position.clone(), "gold");
                }
                const lid = c.getChildren().find(ch => ch.position.y > 0.5);
                if (lid) {
                    const a = new BABYLON.Animation("o", "rotation.x", 30, 0, 0);
                    a.setKeys([{frame:0, value:0}, {frame:15, value:-1.5}]);
                    lid.animations = [a]; this.scene.beginAnimation(lid, 0, 15, false);
                }
            }
        });
    },

    spawnBossChest: async function (p) {
        const c = await this.loadProp('data/chest.json', null);
        c.position = p; c.isChest = true; c.isBossChest = true;
        this.chests.push(c);
        // Visual flair: Gold tint for boss chest
        c.getChildMeshes().forEach(m => {
            if (m.material) {
                const mat = m.material.clone("gc");
                mat.diffuseColor = new BABYLON.Color3(1, 0.84, 0); // Gold
                mat.emissiveColor = new BABYLON.Color3(0.2, 0.1, 0);
                m.material = mat;
            }
        });
        this.showDamageText("BOSS DEFEATED! LOOT SPAWNED!", p, "gold");
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
    },

    generateDungeon: function (w, h) {
        const grid = Array(h).fill().map(() => Array(w).fill(1)), rooms = [];
        const roomCount = 25;
        for (let i = 0; i < roomCount; i++) {
            const isBoss = (i === roomCount - 1);
            const rw = isBoss ? 9 : Math.floor(Math.random() * 5) + 5;
            const rh = isBoss ? 9 : Math.floor(Math.random() * 5) + 5;
            const rx = Math.floor(Math.random() * (w - rw - 2)) + 1, ry = Math.floor(Math.random() * (h - rh - 2)) + 1;
            if (!rooms.some(r => rx < r.x + r.w && rx + rw > r.x && ry < r.y + r.h && ry + rh > r.y)) { for (let y = ry; y < ry + rh; y++) for (let x = rx; x < rx + rw; x++) grid[y][x] = 0; rooms.push({ x: rx, y: ry, w: rw, h: rh }); }
        }
        for (let i = 0; i < rooms.length - 1; i++) {
            let x1 = Math.floor(rooms[i].x + rooms[i].w/2), y1 = Math.floor(rooms[i].y + rooms[i].h/2), x2 = Math.floor(rooms[i+1].x + rooms[i+1].w/2), y2 = Math.floor(rooms[i+1].y + rooms[i+1].h/2);
            for (let x = Math.min(x1, x2); x <= Math.max(x1, x2); x++) { grid[y1][x] = 0; if (y1+1 < grid.length) grid[y1+1][x] = 0; }
            for (let y = Math.min(y1, y2); y <= Math.max(y1, y2); y++) { grid[y][x2] = 0; if (x2+1 < grid[0].length) grid[y][x2+1] = 0; }
        }
        return { grid, rooms, bossRoom: rooms[rooms.length-1] };
    },

    renderDungeon: function (g, s, br) {
        const fMat = new BABYLON.StandardMaterial("f", this.scene); fMat.diffuseColor = new BABYLON.Color3(0.2, 0.2, 0.25);
        const wMat = new BABYLON.StandardMaterial("w", this.scene); wMat.diffuseColor = new BABYLON.Color3(0.4, 0.4, 0.45); wMat.bumpTexture = new BABYLON.Texture("https://www.babylonjs-playground.com/textures/rockn.png", this.scene);
        
        const bWMat = new BABYLON.StandardMaterial("bw", this.scene); bWMat.diffuseColor = new BABYLON.Color3(0.1, 0.05, 0.05); bWMat.specularColor = new BABYLON.Color3(0.4, 0, 0);
        const bFMat = new BABYLON.StandardMaterial("bf", this.scene); bFMat.diffuseColor = new BABYLON.Color3(0.05, 0.05, 0.08);

        let floors = [], walls = [], bFloors = [], bWalls = [];
        for (let y = 0; y < g.length; y++) {
            for (let x = 0; x < g[0].length; x++) {
                const p = new BABYLON.Vector3(x * this.gridSize, 0, y * this.gridSize);
                const isBR = br && x >= br.x && x < br.x + br.w && y >= br.y && y < br.y + br.h;
                if (g[y][x] === 0) {
                    const f = BABYLON.MeshBuilder.CreatePlane("f", { size: this.gridSize }, this.scene);
                    f.rotation.x = Math.PI / 2; f.position = p; (isBR ? bFloors : floors).push(f);
                } else {
                    const w = BABYLON.MeshBuilder.CreateBox("w", { size: this.gridSize, height: 2.5 }, this.scene);
                    w.position = p.add(new BABYLON.Vector3(0, 1.25, 0)); (isBR ? bWalls : walls).push(w);
                }
            }
        }

        const merge = (list, mat, shad, collisions) => {
            if (list.length > 0) {
                const m = BABYLON.Mesh.MergeMeshes(list, true, true, undefined, false, true);
                m.material = mat; if(shad) shad.addShadowCaster(m); m.checkCollisions = collisions;
                if(mat === fMat || mat === bFMat) m.receiveShadows = true; return m;
            }
        };

        merge(floors, fMat, null, true); merge(walls, wMat, s, true);
        merge(bFloors, bFMat, null, true); merge(bWalls, bWMat, s, true);
    },

    handlePlayerMovement: function () {
        if (!this.player) return; let mov = false;
        if (this.inputMap["w"]) { this.player.moveWithCollisions(this.player.forward.scale(0.12)); mov = true; }
        if (this.inputMap["s"]) { this.player.moveWithCollisions(this.player.forward.scale(-0.06)); mov = true; }
        if (this.inputMap["a"]) this.player.rotation.y -= 0.05; if (this.inputMap["d"]) this.player.rotation.y += 0.05;
        this.player.isMoving = mov;
    },

    updateAnimations: function () {
        const now = Date.now(), all = [this.player, ...this.entities];
        all.forEach(e => {
            if (!e || !e.userData) return; const ud = e.userData;
            if (e.isMoving) { const s = Math.sin(now * 0.008 + (e.uniqueId % 10)) * 0.5; ud.legL.rotation.x = s; ud.legR.rotation.x = -s; if (!e.isSwinging) { ud.armL.rotation.x = -s*0.8; ud.armR.rotation.x = s*0.8; } }
            else { ud.legL.rotation.x *= 0.8; ud.legR.rotation.x *= 0.8; if (!e.isSwinging) { ud.armL.rotation.x *= 0.8; ud.armR.rotation.x *= 0.8; } }
        });
    },

    loadProp: async function (u, s, targetScene) {
        const currentScene = targetScene || this.scene;
        try {
            const res = await fetch(u); const d = await res.json(); const g = new BABYLON.TransformNode("p_" + u, currentScene);
            const p = d.Parts || d.parts; if (p) p.forEach(pt => {
                let m; const sh = (pt.Shape || "Box").toLowerCase();
                if (sh === "sphere") m = BABYLON.MeshBuilder.CreateSphere("p", { diameter: 1 }, currentScene);
                else if (sh === "cylinder") m = BABYLON.MeshBuilder.CreateCylinder("p", { diameter: 1, height: 1 }, currentScene);
                else m = BABYLON.MeshBuilder.CreateBox(pt.Id || "p", { size: 1 }, currentScene);
                m.parent = g; m.position.set(pt.Position[0], pt.Position[1], pt.Position[2]); m.rotation.set(pt.Rotation[0]*Math.PI/180, pt.Rotation[1]*Math.PI/180, pt.Rotation[2]*Math.PI/180); m.scaling.set(pt.Scale[0], pt.Scale[1], pt.Scale[2]);
                const mt = new BABYLON.StandardMaterial("pm", currentScene); mt.diffuseColor = BABYLON.Color3.FromHexString(pt.ColorHex || "#FFFFFF");
                if ((pt.Material || "").toLowerCase().includes("metal")) { mt.specularPower = 64; mt.specularColor = new BABYLON.Color3(0.5, 0.5, 0.5); } else if ((pt.Material || "").toLowerCase().includes("glow")) mt.emissiveColor = mt.diffuseColor;
                m.material = mt; if(s) s.addShadowCaster(m);
            }); return g;
        } catch (e) { return null; }
    },

    loadVoxelModel: async function (d, s, e = {}, targetScene) {
        const currentScene = targetScene || this.scene;
        const root = BABYLON.MeshBuilder.CreateBox("root", { size: 0.1 }, currentScene); root.isVisible = false; root.checkCollisions = true; root.ellipsoid = new BABYLON.Vector3(0.4, 0.9, 0.4); root.ellipsoidOffset = new BABYLON.Vector3(0, 0.9, 0);
        const c = d.ProceduralColors || { Skin: "#D2B48C", Shirt: "#71797E", Pants: "#3E2723" };
        const mTex = (n, hx, w, h) => {
            if (!hx) return null; const res = 64, dt = new BABYLON.DynamicTexture(n, res, currentScene, false); const ctx = dt.getContext(); const pW = res/w, pH = res/h;
            for (let i = 0; i < hx.length; i++) { ctx.fillStyle = hx[i]; ctx.fillRect((i%w)*pW, Math.floor(i/w)*pH, pW, pH); }
            dt.update(); dt.wrapU = dt.wrapV = BABYLON.Texture.CLAMP_ADDRESSMODE; return dt;
        };
        const tF = mTex("f", d.Textures.Face, 8, 8), tC = mTex("c", d.Textures.Chest, 8, 12), tA = mTex("a", d.Textures.Arms, 4, 12), tL = mTex("l", d.Textures.Legs, 4, 13);
        const mS = new BABYLON.StandardMaterial("s", currentScene); mS.diffuseColor = BABYLON.Color3.FromHexString(c.Skin);
        const mC = new BABYLON.StandardMaterial("c", currentScene); mC.diffuseTexture = tC;
        const mL = new BABYLON.StandardMaterial("l", currentScene); mL.diffuseTexture = tL;
        const mA = new BABYLON.StandardMaterial("a", currentScene); mA.diffuseTexture = tA;
        const fM = new BABYLON.MultiMaterial("fm", currentScene); fM.subMaterials = [new BABYLON.StandardMaterial("f", currentScene), mS, mS, mS, mS, mS]; fM.subMaterials[0].diffuseTexture = tF;
        const torso = BABYLON.MeshBuilder.CreateBox("t", { width: 0.6, height: 0.8, depth: 0.3 }, currentScene); torso.parent = root; torso.position.y = 1.1; torso.material = mC; if(s) s.addShadowCaster(torso);
        const head = BABYLON.MeshBuilder.CreateBox("h", { size: 0.45 }, currentScene); head.parent = root; head.position.y = 1.75; head.material = fM; head.subMeshes = []; for(let i=0; i<6; i++) new BABYLON.SubMesh(i, 0, head.getTotalVertices(), i*6, 6, head);
        const cA = (isL) => { const p = new BABYLON.TransformNode("p", currentScene); p.parent = torso; p.position.set(isL ? 0.4 : -0.4, 0.3, 0); const a = BABYLON.MeshBuilder.CreateBox("a", { width: 0.2, height: 0.7, depth: 0.2 }, currentScene); a.parent = p; a.position.y = -0.3; a.material = mA; if(s) s.addShadowCaster(a); return p; };
        const aL = cA(true), aR = cA(false);
        const cL = (isL) => { const p = new BABYLON.TransformNode("p", currentScene); p.parent = root; p.position.set(isL ? 0.18 : -0.18, 0.7, 0); const l = BABYLON.MeshBuilder.CreateBox("l", { width: 0.25, height: 0.7, depth: 0.25 }, currentScene); l.parent = p; l.position.y = -0.3; l.material = mL; if(s) s.addShadowCaster(l); return p; };
        const lL = cL(true), lR = cL(false);

        const addPart = async (u, parent, pos, rot, sc) => { if (!u) return; const pt = await this.loadProp(u, s, currentScene); if (pt) { pt.parent = parent; pt.position.set(pos[0], pos[1], pos[2]); pt.rotation.set(rot[0], rot[1], rot[2]); pt.scaling.set(sc[0], sc[1], sc[2]); } };
        if (e.head) await addPart(e.head, head, [0, 0.1, 0], [0, 0, 0], [1, 1, 1]);
        if (e.chest) await addPart(e.chest, torso, [0, 0, 0], [0, 0, 0], [1, 1, 1]);
        if (e.right) await addPart(e.right, aR, [0, -0.6, 0], [Math.PI/2, 0, 0], [1, 1, 1]);
        if (e.left) await addPart(e.left, aL, [0.2, -0.4, 0], [0, -Math.PI/2, 0], [1, 1, 1]);
        if (e.legs) { await addPart(e.legs, lL, [0, -0.3, 0], [0,0,0], [1,1,1]); await addPart(e.legs, lR, [0, -0.3, 0], [0,0,0], [1,1,1]); }
        root.userData = { armL: aL, armR: aR, legL: lL, legR: lR, ai: { target: null, idle: 0, lastPos: null, stuckCount: 0 } }; return root;
    }
};
