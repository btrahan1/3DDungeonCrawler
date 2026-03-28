window.DungeonCrawler = {
    canvas: null, engine: null, scene: null, camera: null, player: null, ui: null,
    inputMap: {}, entities: [], chests: [], stairs: null,
    dungeonSize: 30, gridSize: 2.5, currentLevel: 1, dotnetRef: null,
    isTransitioning: false,

    init: async function (canvasId, dotnetRef) {
        if (this.engine) {
            // Clear existing UI and Scene
            this.entities.forEach(e => { if (e.healthContainerUI) e.healthContainerUI.dispose(); });
            this.scene.dispose();
            this.entities = [];
            this.chests = [];
            this.stairs = null;
        }
        this.isTransitioning = false;

        this.dotnetRef = dotnetRef;
        this.canvas = document.getElementById(canvasId);
        if (!this.engine) {
            this.engine = new BABYLON.Engine(this.canvas, true);
            window.addEventListener("resize", () => this.engine.resize());
        }
        
        this.scene = new BABYLON.Scene(this.engine);
        this.scene.clearColor = new BABYLON.Color4(0.01, 0.01, 0.02, 1);
        this.scene.collisionsEnabled = true;

        // --- Camera ---
        this.camera = new BABYLON.ArcRotateCamera("camera", -Math.PI / 2, Math.PI / 3, 15, BABYLON.Vector3.Zero(), this.scene);
        this.camera.attachControl(this.canvas, true);
        this.camera.lowerRadiusLimit = 5;
        this.camera.upperRadiusLimit = 40;

        // --- Lighting ---
        const hemi = new BABYLON.HemisphericLight("hemi", new BABYLON.Vector3(0, 1, 0), this.scene);
        hemi.intensity = 0.4;
        const dir = new BABYLON.DirectionalLight("dir", new BABYLON.Vector3(-1, -2, -1), this.scene);
        dir.position = new BABYLON.Vector3(20, 40, 20);
        const shadowGen = new BABYLON.ShadowGenerator(1024, dir);
        shadowGen.useBlurExponentialShadowMap = true;

        // --- GUI ---
        this.ui = BABYLON.GUI.AdvancedDynamicTexture.CreateFullscreenUI("UI");
        this.initHUD();

        // --- Input ---
        this.scene.onKeyboardObservable.add((kbInfo) => {
            const key = kbInfo.event.key.toLowerCase();
            if (kbInfo.type === BABYLON.KeyboardEventTypes.KEYDOWN) {
                this.inputMap[key] = true;
                if (key === " ") this.handleCombat();
                if (key === "e") this.handleInteractions();
                if (key === "escape") {
                    if (this.dotnetRef) this.dotnetRef.invokeMethodAsync("ToggleESCMenu");
                }
            } else {
                this.inputMap[key] = false;
            }
        });

        this.scene.onPointerDown = (evt, pickResult) => {
            if (pickResult.hit && pickResult.pickedMesh) {
                let mesh = pickResult.pickedMesh;
                // Traverse up to find the stairs group if needed
                while (mesh.parent && !mesh.isStairs) { mesh = mesh.parent; }
                
                if (mesh.isStairs) {
                    const dist = BABYLON.Vector3.Distance(this.player.position, mesh.position);
                    if (dist < 4.0) {
                        this.showDescentDialog();
                    }
                }
            }
        };

        // --- Dungeon ---
        const dungeonData = this.generateDungeon(this.dungeonSize, this.dungeonSize);
        this.renderDungeon(dungeonData.grid, shadowGen);

        // --- Player ---
        try {
            const res = await fetch('data/Player.json');
            const data = await res.json();
            this.player = await this.loadVoxelModel(data, shadowGen, { right: 'data/sword.json', left: 'data/shield.json' });
            this.player.health = 100; this.player.maxHealth = 100;
            this.player.position = new BABYLON.Vector3(dungeonData.rooms[0].x * this.gridSize, 0.1, dungeonData.rooms[0].y * this.gridSize);
            this.camera.setTarget(this.player);
        } catch (e) { console.error(e); }

        // NPC Spawning (Reduced frequency)
        for (let i = 1; i < dungeonData.rooms.length; i++) {
            if (Math.random() > 0.6) continue; // 40% chance per room
            const room = dungeonData.rooms[i];
            // NPC
            const isG = Math.random() > 0.4;
            const resN = await fetch(isG ? 'data/goblin.json' : 'data/orc.json');
            const npc = await this.loadVoxelModel(await resN.json(), shadowGen, { right: isG ? 'data/axe.json' : 'data/mace.json' });
            npc.position = new BABYLON.Vector3((room.x+room.w/2)*this.gridSize, 0.1, (room.y+room.h/2)*this.gridSize);
            npc.health = isG ? 30 : 60; npc.maxHealth = npc.health; this.entities.push(npc); this.createHealthBar(npc);
            
            // Chest
            if (Math.random() > 0.5) {
                const chest = await this.loadProp('data/chest.json', shadowGen);
                chest.position = new BABYLON.Vector3((room.x+1)*this.gridSize, 0, (room.y+1)*this.gridSize);
                chest.isChest = true; this.chests.push(chest);
            }
        }

        // --- Stairs (Exit) ---
        const lastRoom = dungeonData.rooms[dungeonData.rooms.length - 1];
        this.stairs = await this.loadProp('data/stairs.json', shadowGen);
        this.stairs.position = new BABYLON.Vector3((lastRoom.x + lastRoom.w - 1) * this.gridSize, 0, (lastRoom.y + lastRoom.h - 1) * this.gridSize);
        this.stairs.isStairs = true;

        // --- Loop ---
        if (this.engine) this.engine.stopRenderLoop();
        this.engine.runRenderLoop(() => {
            if (this.player && !this.scene.isPaused) {
                this.handlePlayerMovement();
                this.handleNPCMovement();
                this.updateAnimations();
                this.updateHUD();
            }
            this.scene.render();
        });
    },

    checkTransistions: function () {
        if (!this.isTransitioning && this.stairs && BABYLON.Vector3.Distance(this.player.position, this.stairs.position) < 1.5) {
            this.isTransitioning = true;
            this.currentLevel++;
            this.showDamageText("DESCENDING...", this.player.position.clone(), "cyan");
            setTimeout(() => {
                this.init(this.canvas.id, this.dotnetRef);
            }, 1000);
        }
    },

    // --- HUD ---
    initHUD: function () {
        const stack = new BABYLON.GUI.StackPanel(); stack.width = "250px"; stack.horizontalAlignment = 0; stack.verticalAlignment = 1; stack.left = "20px"; stack.top = "-20px";
        this.ui.addControl(stack);
        const nameText = new BABYLON.GUI.TextBlock(); nameText.text = "LEVEL " + this.currentLevel + " - WARRIOR"; nameText.color = "white"; nameText.height = "30px"; nameText.textHorizontalAlignment = 0; stack.addControl(nameText);
        this.hBar = new BABYLON.GUI.Slider(); this.hBar.minimum = 0; this.hBar.maximum = 100; this.hBar.value = 100; this.hBar.height = "20px"; this.hBar.width = "200px"; this.hBar.color = "red"; this.hBar.background = "#333"; this.hBar.displayThumb = false; stack.addControl(this.hBar);
        this.promptText = new BABYLON.GUI.TextBlock(); this.promptText.text = ""; this.promptText.color = "yellow"; this.promptText.fontSize = 24; this.ui.addControl(this.promptText);
    },

    createHealthBar: function(m) {
        const r = new BABYLON.GUI.Rectangle(); r.width = "50px"; r.height = "8px"; r.background = "#444"; this.ui.addControl(r); r.linkWithMesh(m); r.linkOffsetY = -100; r.isVisible = false;
        const i = new BABYLON.GUI.Rectangle(); i.width = "100%"; i.height = "100%"; i.background = "red"; i.horizontalAlignment = 0; r.addControl(i); m.healthBarUI = i; m.healthContainerUI = r;
    },

    updateHUD: function () {
        this.hBar.value = this.player.health;
        let prompt = "";
        this.chests.forEach(c => { if (BABYLON.Vector3.Distance(this.player.position, c.position) < 2 && !c.isOpen) prompt = "PRESS [E] TO OPEN CHEST"; });
        if (this.stairs && BABYLON.Vector3.Distance(this.player.position, this.stairs.position) < 3) prompt = "CLICK STAIRS TO DESCEND";
        this.promptText.text = prompt;
    },

    showDescentDialog: function () {
        if (this.descentUI) return;

        const panel = new BABYLON.GUI.Rectangle();
        panel.width = "300px"; panel.height = "150px";
        panel.background = "rgba(0,0,0,0.8)"; panel.color = "#d4af37";
        panel.thickness = 2; panel.cornerRadius = 10;
        this.ui.addControl(panel);
        this.descentUI = panel;

        const text = new BABYLON.GUI.TextBlock();
        text.text = "DESCEND TO LEVEL " + (this.currentLevel + 1) + "?";
        text.color = "white"; text.height = "40px"; text.top = "-30px";
        panel.addControl(text);

        const btnYes = BABYLON.GUI.Button.CreateSimpleButton("yes", "YES");
        btnYes.width = "80px"; btnYes.height = "40px"; btnYes.color = "white";
        btnYes.background = "green"; btnYes.left = "-50px"; btnYes.top = "30px";
        btnYes.onPointerUpObservable.add(() => {
            panel.dispose(); this.descentUI = null;
            this.currentLevel++;
            this.isTransitioning = true;
            this.showDamageText("DESCENDING...", this.player.position.clone(), "cyan");
            setTimeout(() => this.init(this.canvas.id, this.dotnetRef), 1000);
        });
        panel.addControl(btnYes);

        const btnNo = BABYLON.GUI.Button.CreateSimpleButton("no", "NO");
        btnNo.width = "80px"; btnNo.height = "40px"; btnNo.color = "white";
        btnNo.background = "red"; btnNo.left = "50px"; btnNo.top = "30px";
        btnNo.onPointerUpObservable.add(() => {
            panel.dispose(); this.descentUI = null;
        });
        panel.addControl(btnNo);
    },

    // --- Mechanics ---
    handleCombat: function () {
        if (!this.player || this.player.isSwinging) return;
        this.player.isSwinging = true;
        const arm = this.player.userData.armR;
        const anim = new BABYLON.Animation("s", "rotation.x", 60, 0, 0);
        anim.setKeys([{frame:0, value:0}, {frame:10, value:1.5}, {frame:20, value:0}]);
        arm.animations = [anim];
        this.scene.beginAnimation(arm, 0, 20, false, 1.5, () => this.player.isSwinging = false);

        setTimeout(() => {
            this.entities.forEach(n => {
                const d = BABYLON.Vector3.Distance(this.player.position, n.position);
                const dot = BABYLON.Vector3.Dot(this.player.forward, n.position.subtract(this.player.position).normalize());
                if (d < 3 && dot > 0.5) {
                    n.health -= 15; n.healthContainerUI.isVisible = true; n.healthBarUI.width = (n.health/n.maxHealth*100) + "%";
                    n.moveWithCollisions(n.position.subtract(this.player.position).normalize().scale(0.6));
                    this.showDamageText("-15", n.position.clone());
                    if (n.health <= 0) { this.entities = this.entities.filter(e => e !== n); n.healthContainerUI.dispose(); n.dispose(); }
                }
            });
        }, 150);
    },

    handleInteractions: function () {
        this.chests.forEach(c => {
            if (BABYLON.Vector3.Distance(this.player.position, c.position) < 2 && !c.isOpen) {
                c.isOpen = true; this.showDamageText("LOOT!", c.position.clone(), "gold");
                const lid = c.getChildren().find(ch => ch.position.y > 0.5);
                if (lid) {
                    const a = new BABYLON.Animation("o", "rotation.x", 30, 0, 0); a.setKeys([{frame:0, value:0}, {frame:15, value:-1.5}]);
                    lid.animations = [a]; this.scene.beginAnimation(lid, 0, 15, false);
                }
            }
        });
    },

    showDamageText: function (t, p, c = "white") {
        const txt = new BABYLON.GUI.TextBlock(); txt.text = t; txt.color = c; txt.fontSize = 20; this.ui.addControl(txt);
        const loop = setInterval(() => {
            const proj = BABYLON.Vector3.Project(p.add(new BABYLON.Vector3(0,2,0)), BABYLON.Matrix.Identity(), this.scene.getTransformMatrix(), this.camera.viewport.toGlobal(this.engine.getRenderWidth(), this.engine.getRenderHeight()));
            txt.left = proj.x - this.engine.getRenderWidth()/2; txt.top = proj.y - this.engine.getRenderHeight()/2;
            txt.alpha = (txt.alpha || 1) - 0.02; txt.top -= 1; if (txt.alpha <= 0) { clearInterval(loop); txt.dispose(); }
        }, 20);
    },

    // --- Generation ---
    generateDungeon: function (w, h) {
        const grid = Array(h).fill().map(() => Array(w).fill(1)), rooms = [];
        for (let i = 0; i < 10; i++) {
            const rw = Math.floor(Math.random() * 4) + 4, rh = Math.floor(Math.random() * 4) + 4;
            const rx = Math.floor(Math.random() * (w - rw - 2)) + 1, ry = Math.floor(Math.random() * (h - rh - 2)) + 1;
            if (!rooms.some(r => rx < r.x + r.w && rx + rw > r.x && ry < r.y + r.h && ry + rh > r.y)) {
                for (let y = ry; y < ry + rh; y++) for (let x = rx; x < rx + rw; x++) grid[y][x] = 0;
                rooms.push({ x: rx, y: ry, w: rw, h: rh });
            }
        }
        for (let i = 0; i < rooms.length - 1; i++) this.carvePipes(grid, rooms[i], rooms[i + 1]);
        return { grid, rooms };
    },

    carvePipes: function (grid, r1, r2) {
        let x1 = Math.floor(r1.x + r1.w/2), y1 = Math.floor(r1.y + r1.h/2), x2 = Math.floor(r2.x + r2.w/2), y2 = Math.floor(r2.y + r2.h/2);
        for (let x = Math.min(x1, x2); x <= Math.max(x1, x2); x++) { grid[y1][x] = 0; if (y1+1 < grid.length) grid[y1+1][x] = 0; }
        for (let y = Math.min(y1, y2); y <= Math.max(y1, y2); y++) { grid[y][x2] = 0; if (x2+1 < grid[0].length) grid[y][x2+1] = 0; }
    },

    renderDungeon: function (g, s) {
        const fMat = new BABYLON.StandardMaterial("f", this.scene); fMat.diffuseColor = new BABYLON.Color3(0.2, 0.2, 0.25);
        const wMat = new BABYLON.StandardMaterial("w", this.scene); wMat.diffuseColor = new BABYLON.Color3(0.4, 0.4, 0.45); wMat.bumpTexture = new BABYLON.Texture("https://www.babylonjs-playground.com/textures/rockn.png", this.scene);
        for (let y = 0; y < g.length; y++) for (let x = 0; x < g[0].length; x++) {
            const p = new BABYLON.Vector3(x * this.gridSize, 0, y * this.gridSize);
            if (g[y][x] === 0) {
                const f = BABYLON.MeshBuilder.CreatePlane("f", { size: this.gridSize }, this.scene); f.rotation.x = Math.PI/2; f.position = p; f.material = fMat; f.checkCollisions = true; f.receiveShadows = true;
            } else {
                const w = BABYLON.MeshBuilder.CreateBox("w", { size: this.gridSize, height: 2.5 }, this.scene); w.position = p.add(new BABYLON.Vector3(0, 1.25, 0)); w.material = wMat; w.checkCollisions = true; s.addShadowCaster(w);
            }
        }
    },

    loadVoxelModel: async function (d, s, e = {}) {
        const root = BABYLON.MeshBuilder.CreateBox("root", { size: 0.1 }, this.scene); root.isVisible = false; root.checkCollisions = true; root.ellipsoid = new BABYLON.Vector3(0.4, 0.9, 0.4); root.ellipsoidOffset = new BABYLON.Vector3(0, 0.9, 0);
        const c = d.ProceduralColors || { Skin: "#D2B48C", Shirt: "#71797E", Pants: "#3E2723" };
        const mTex = (n, hx, w, h) => {
            if (!hx) return null; const res = 64, dt = new BABYLON.DynamicTexture(n, res, this.scene, false); const ctx = dt.getContext(); const pW = res/w, pH = res/h;
            for (let i = 0; i < hx.length; i++) { ctx.fillStyle = hx[i]; ctx.fillRect((i%w)*pW, Math.floor(i/w)*pH, pW, pH); }
            dt.update(); dt.wrapU = dt.wrapV = BABYLON.Texture.CLAMP_ADDRESSMODE; return dt;
        };
        const tF = mTex("f", d.Textures.Face, 8, 8), tC = mTex("c", d.Textures.Chest, 8, 12), tA = mTex("a", d.Textures.Arms, 4, 12), tL = mTex("l", d.Textures.Legs, 4, 13);
        const mS = new BABYLON.StandardMaterial("s", this.scene); mS.diffuseColor = BABYLON.Color3.FromHexString(c.Skin);
        const mC = new BABYLON.StandardMaterial("c", this.scene); mC.diffuseTexture = tC;
        const mL = new BABYLON.StandardMaterial("l", this.scene); mL.diffuseTexture = tL;
        const mA = new BABYLON.StandardMaterial("a", this.scene); mA.diffuseTexture = tA;
        const fM = new BABYLON.MultiMaterial("fm", this.scene); fM.subMaterials = [new BABYLON.StandardMaterial("f", this.scene), mS, mS, mS, mS, mS]; fM.subMaterials[0].diffuseTexture = tF;
        const torso = BABYLON.MeshBuilder.CreateBox("t", { width: 0.6, height: 0.8, depth: 0.3 }, this.scene); torso.parent = root; torso.position.y = 1.1; torso.material = mC; s.addShadowCaster(torso);
        const head = BABYLON.MeshBuilder.CreateBox("h", { size: 0.45 }, this.scene); head.parent = root; head.position.y = 1.75; head.material = fM; head.subMeshes = [];
        for(let i=0; i<6; i++) new BABYLON.SubMesh(i, 0, head.getTotalVertices(), i*6, 6, head);
        const cA = (isL) => {
            const p = new BABYLON.TransformNode("p", this.scene); p.parent = torso; p.position.set(isL ? 0.4 : -0.4, 0.3, 0);
            const a = BABYLON.MeshBuilder.CreateBox("a", { width: 0.2, height: 0.7, depth: 0.2 }, this.scene); a.parent = p; a.position.y = -0.3; a.material = mA; s.addShadowCaster(a); return p;
        };
        const aL = cA(true), aR = cA(false);
        const cL = (isL) => {
            const p = new BABYLON.TransformNode("p", this.scene); p.parent = root; p.position.set(isL ? 0.18 : -0.18, 0.7, 0);
            const l = BABYLON.MeshBuilder.CreateBox("l", { width: 0.25, height: 0.7, depth: 0.25 }, this.scene); l.parent = p; l.position.y = -0.3; l.material = mL; s.addShadowCaster(l); return p;
        };
        const lL = cL(true), lR = cL(false);
        if (e.right) { const wp = await this.loadProp(e.right, s); if (wp) { wp.parent = aR; wp.position.y = -0.6; wp.rotation.x = Math.PI/2; } }
        if (e.left) { const wp = await this.loadProp(e.left, s); if (wp) { wp.parent = aL; wp.position.y = -0.4; wp.position.x = 0.2; wp.rotation.y = -Math.PI/2; } }
        root.userData = { armL: aL, armR: aR, legL: lL, legR: lR, ai: { target: null, idle: 0, lastPos: null, stuckCount: 0 } }; return root;
    },

    loadProp: async function (u, s) {
        try {
            const res = await fetch(u); const d = await res.json(); const g = new BABYLON.TransformNode("p_" + u, this.scene);
            const p = d.Parts || d.parts; if (p) p.forEach(pt => {
                let m; const sh = (pt.Shape || "Box").toLowerCase();
                if (sh === "sphere") m = BABYLON.MeshBuilder.CreateSphere("p", { diameter: 1 }, this.scene);
                else if (sh === "cylinder") m = BABYLON.MeshBuilder.CreateCylinder("p", { diameter: 1, height: 1 }, this.scene);
                else m = BABYLON.MeshBuilder.CreateBox(pt.Id || "p", { size: 1 }, this.scene);
                m.parent = g; const ps = pt.Position || [0,0,0], r = pt.Rotation || [0,0,0], sc = pt.Scale || [1,1,1];
                m.position.set(ps[0], ps[1], ps[2]); m.rotation.set(r[0]*Math.PI/180, r[1]*Math.PI/180, r[2]*Math.PI/180); m.scaling.set(sc[0], sc[1], sc[2]);
                const mt = new BABYLON.StandardMaterial("pm", this.scene); mt.diffuseColor = BABYLON.Color3.FromHexString(pt.ColorHex || "#FFFFFF");
                if ((pt.Material || "").toLowerCase().includes("metal")) { mt.specularPower = 64; mt.specularColor = new BABYLON.Color3(0.5, 0.5, 0.5); }
                else if ((pt.Material || "").toLowerCase().includes("glow")) mt.emissiveColor = mt.diffuseColor;
                m.material = mt; s.addShadowCaster(m);
            }); return g;
        } catch (e) { return null; }
    },

    handlePlayerMovement: function () {
        if (!this.player) return; const spd = 0.12, rSpd = 0.05; let mov = false;
        if (this.inputMap["w"]) { this.player.moveWithCollisions(this.player.forward.scale(spd)); mov = true; }
        if (this.inputMap["s"]) { this.player.moveWithCollisions(this.player.forward.scale(-spd*0.5)); mov = true; }
        if (this.inputMap["a"]) this.player.rotation.y -= rSpd; if (this.inputMap["d"]) this.player.rotation.y += rSpd;
        this.player.isMoving = mov;
    },

    handleNPCMovement: function () {
        this.entities.forEach(n => {
            const ai = n.userData.ai;
            if (!ai.target) {
                if (ai.idle > 0) { ai.idle--; n.isMoving = false; }
                else { ai.target = new BABYLON.Vector3(n.position.x + (Math.random()-0.5)*10, 0, n.position.z + (Math.random()-0.5)*10); ai.lastPos = n.position.clone(); ai.stuckCount = 0; }
            } else {
                const diff = ai.target.subtract(n.position);
                if (diff.length() < 0.5) { ai.target = null; ai.idle = 50 + Math.random()*100; }
                else {
                    if (ai.lastPos && BABYLON.Vector3.Distance(n.position, ai.lastPos) < 0.01) { ai.stuckCount++; if (ai.stuckCount > 30) { ai.target = null; ai.idle = 10; return; } }
                    else ai.stuckCount = 0;
                    ai.lastPos = n.position.clone();
                    n.rotation.y = BABYLON.Scalar.LerpAngle(n.rotation.y, Math.atan2(diff.x, diff.z), 0.1); n.moveWithCollisions(n.forward.scale(0.05)); n.isMoving = true;
                }
            }
        });
    },

    updateAnimations: function () {
        const now = Date.now(), all = [this.player, ...this.entities];
        all.forEach(e => {
            if (!e || !e.userData) return; const ud = e.userData;
            if (e.isMoving) {
                const s = Math.sin(now * 0.008 + (e.uniqueId % 10)) * 0.5; ud.legL.rotation.x = s; ud.legR.rotation.x = -s;
                if (!e.isSwinging) { ud.armL.rotation.x = -s*0.8; ud.armR.rotation.x = s*0.8; }
            } else {
                ud.legL.rotation.x *= 0.8; ud.legR.rotation.x *= 0.8;
                if (!e.isSwinging) { ud.armL.rotation.x *= 0.8; ud.armR.rotation.x *= 0.8; }
            }
        });
    }
};
