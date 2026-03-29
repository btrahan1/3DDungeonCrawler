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
            if (isBossRoom) { npc.scaling.set(2.25, 2.25, 2.25); npc.health = (isG ? 100 : 200) + (this.currentLevel * 20); npc.isBoss = true; } else { npc.health = isG ? 30 : 60; }
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
            const eMap = { head: equip.head?.modelPath, chest: equip.chest?.modelPath, hands: equip.hands?.modelPath, legs: equip.legs?.modelPath, feet: equip.feet?.modelPath, right: equip.rightHand?.modelPath || 'data/sword.json', left: equip.leftHand?.modelPath || 'data/shield.json' };
            const model = await this.loadVoxelModel(await res.json(), null, eMap, scene);
            model.rotation.y = Math.PI;
        } catch (e) { console.error(e); }
        engine.runRenderLoop(() => { scene.render(); });
        window.addEventListener("resize", () => engine.resize());
        return { engine, scene };
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
    }
};
