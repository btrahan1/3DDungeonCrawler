// Loaders Module for Babylon.js Dungeon Crawler (Voxel & Prop Loading)
window.DungeonCrawler = Object.assign(window.DungeonCrawler || {}, {
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
});
