"use strict";

import * as THREE from './lib/three.js';
import { SVGLoader } from "./lib/SVGLoader.js";
import { GLTFLoader } from "./lib/GLTFLoader.js";
import { GUI } from "./lib/dat.gui.js";
import Stats from "./lib/stats.js";
import easing from "./lib/easings.js";
import noise from "./lib/perlin.js";

let canvas, stats, camera, scene, renderer, gui, guiData = {};
let filesWaitingToLoad = 0;

let cameraPivot;
let logoPivot, logoGroup, logoMaterials = [];

let holeGroup;
let wormholeLines = [], wormholeCircles = [], distanceBetweenCircles, circleRadiusMax, circleRadiusMin, numberOfCircles;

// Models
let sphereModel, triplanarModel, orbitModel;

let cameraShakeIntensity = 0;
let cameraShakeSeed = Math.random();
let mouseNormalizedPos = {x: 0, y:0};

var moveTowards = function(from, to, delta)
{
    if (from < to) {
        return Math.min(to, from + delta);
    }
    else {
        return Math.max(to, from - delta);
    }
}

init();
var lastUpdate = Date.now();
animate();

function init() {
    // rendering
    
    canvas = document.querySelector('#c');
    renderer = new THREE.WebGL1Renderer({
        canvas: canvas,
        //alpha: true,
        extensions: {'OES_standard_derivatives': true},
        //antialias: true
        ouputEncoding: THREE.sRGBEncoding
    });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.getContext().getExtension('OES_standard_derivatives');
    document.body.appendChild(renderer.domElement);

    stats = new Stats();
    document.getElementById('stats').appendChild(stats.dom);
    
    // Main Scene
    scene = new THREE.Scene();
    
    cameraPivot = new THREE.Object3D();
    cameraPivot.position.z = 0;
    cameraPivot.position.y = 0;
    scene.add(cameraPivot);

    camera = new THREE.PerspectiveCamera(guiData.cameraFOV, window.innerWidth / window.innerHeight, 1, 1000);
    camera.position.z = guiData.cameraDistanceZ;
    cameraPivot.add(camera);

    createDebugGUI();
    
    // MATERIALS
    
    const invisibleMaterial = new THREE.MeshBasicMaterial({ colorWrite: false });

    const wormlinesMaterial = new THREE.LineBasicMaterial({
        color: 0x49FF5E,
        linewidth: 3
    });
    const outlineMaterial = new THREE.LineBasicMaterial({
        color: 0xffffff,
        linewidth: 3
    });
    const debugMaterial = new THREE.MeshBasicMaterial({color: 0xff00ff});

    const textureLoader = new THREE.TextureLoader();
    
    // logo
    logoPivot = new THREE.Object3D();
    logoPivot.position.z = guiData.logoPosZ;
    scene.add(logoPivot);

    // SVGs

    const loader = new SVGLoader();
    loader.load("res/full-logo.svg", function (data) {
        
        const paths = data.paths;
        const group = new THREE.Group();
        var scale = 0.025;
        group.scale.multiplyScalar( scale );
        var logoSideSize = 80 * scale;
        group.position.x = -logoSideSize;
        group.position.z = -1;
        group.position.y = logoSideSize + 1.2 * scale;//guiData.spaceshipEndY
        group.scale.y *= - 1;
        
        const alwaysVisibleGroup = new THREE.Group();
        alwaysVisibleGroup.scale.copy(group.scale);
        alwaysVisibleGroup.position.copy(group.position);
        
        const starMaterial = new THREE.MeshBasicMaterial( {
            color: 0xffffff,
            side: THREE.DoubleSide,
            depthWrite: false
        });

        for ( let i = 0; i < paths.length; i ++ ) {
            const path = paths[ i ];
            const fillColor = path.userData.style.fill;
            
            //console.log(i, fillColor);
            //if (i == 0) continue;
            
            if (fillColor !== undefined && fillColor !== 'none') {
                const material = new THREE.MeshBasicMaterial( {
                    color: new THREE.Color().setStyle( fillColor ),
                    side: THREE.DoubleSide,
                    depthWrite: false
                });
                logoMaterials.push(material);
                const shapes = SVGLoader.createShapes( path );
                for ( let j = 0; j < shapes.length; j ++ ) {
                    //if (i == 32 && j == 0) continue; // Arrow
                    const shape = shapes[ j ];
                    const geometry = new THREE.ShapeGeometry( shape );
                    //console.log(j, geometry.attributes.position.array.length / 3);
                    
                    if (i == 2 && j < 23 && false) { // stars
                        const mesh = new THREE.Mesh(geometry, starMaterial);
                        alwaysVisibleGroup.add(mesh);
                        mesh.position.z = THREE.MathUtils.lerp(-500, 0, Math.random());
                        //console.log(THREE.MathUtils.lerp(-10, 0, Math.random()), mesh.position.z);
                    }
                    else {
                        const mesh = new THREE.Mesh( geometry, material );
                        group.add( mesh );
                    }
                }
            }
            
            const strokeColor = path.userData.style.stroke;
            if (strokeColor !== undefined && strokeColor !== 'none') {
                const strokeMaterial = new THREE.MeshBasicMaterial( {
                    color: new THREE.Color().setStyle( strokeColor ),
                    side: THREE.DoubleSide,
                    depthWrite: false,
                });
                logoMaterials.push(strokeMaterial);
    
                for ( let j = 0, jl = path.subPaths.length; j < jl; j ++ ) {
                    const subPath = path.subPaths[ j ];
                    const geometry = SVGLoader.pointsToStroke( subPath.getPoints(), path.userData.style );
    
                    if ( geometry ) {
                        const mesh = new THREE.Mesh( geometry, strokeMaterial );
                        group.add( mesh );
                    }
                }
            }
        }
        
        logoPivot.add(group);
        logoPivot.add(alwaysVisibleGroup);
        logoGroup = group;
        
        filesWaitingToLoad--;
    });
    filesWaitingToLoad++;

    // Wormhole
    holeGroup = new THREE.Group();
    holeGroup.position.y = -2;
    const circleSegments = 18;
    numberOfCircles = 10;
    circleRadiusMax = 1;
    circleRadiusMin = circleRadiusMax * 0.3;
    distanceBetweenCircles = circleRadiusMax * 0.1;
    var circlesCenter = new THREE.Vector3();
            
    var allCirclePoints = [];
    for(let i = 0; i < numberOfCircles; ++i)
    {
        const points = [];
        const radius = THREE.MathUtils.lerp(circleRadiusMax, circleRadiusMin, easing.easeOutQuad(i / (numberOfCircles - 1)));
        const depth = (-i - 1) * distanceBetweenCircles;
        for (let j = 0; j < circleSegments + 1; ++j)
        {
            var angle = j * Math.PI * 2 / circleSegments;
            points.push(new THREE.Vector3(Math.cos(angle), 0, Math.sin(angle)).add(circlesCenter));
        }
        const wormholeGeometry = new THREE.BufferGeometry().setFromPoints( points );
        const circle = new THREE.Line( wormholeGeometry, wormlinesMaterial );
        circle.scale.set(radius, radius, radius);
        circle.position.setY(depth);
        wormholeCircles.push(circle);
                
        // Correct points for later use on vertical lines
        for (let j = 0; j < circleSegments + 1; ++j)
        {
            points[j].setX(points[j].x * radius);
            points[j].setZ(points[j].z * radius);
            points[j].setY(depth);
        }

        allCirclePoints.push(points);
        holeGroup.add(circle);
    }
            
    const verticalLineEveryN = 1;
    for (let i = 0; i < circleSegments; i += verticalLineEveryN)
    {
        const points = [];
        for (let j = 0; j < allCirclePoints.length; ++j)
        {
            points.push(allCirclePoints[j][i]);
        }
        const wormholeVerticalGeometry = new THREE.BufferGeometry().setFromPoints( points );
        const line = new THREE.Line( wormholeVerticalGeometry, wormlinesMaterial );
        wormholeLines.push(line);
        holeGroup.add(line);
    }

    scene.add(holeGroup);

    // Models
    const gltfLoader = new GLTFLoader();
    gltfLoader.load("res/3d/sphere.glb",function (gltf) {
        sphereModel = new THREE.Group();
        sphereModel.add(gltf.scene);
        scene.add(sphereModel);
    });
    
    gltfLoader.load("res/3d/orbit.glb",function (gltf) {
        triplanarModel = new THREE.Group();
        triplanarModel.add(gltf.scene);
        scene.add(triplanarModel);
    });
    
    gltfLoader.load("res/3d/triplanar.glb",function (gltf) {
        orbitModel = new THREE.Group();
        orbitModel.add(gltf.scene);
        scene.add(orbitModel);
    });
}


function createDebugGUI ()
{
    if (gui) gui.destroy();

    gui = new GUI({ width: 350 });

    // GUI
    
    var logoGUI = gui.addFolder("Logo");
    guiData["logoSize"] = 1;
    logoGUI.add(guiData, "logoSize", 0.001, 20).name("Logo Size")
    .onChange(function () {
        logoGroup.scale.set(guiData.logoSize, guiData.logoSize, guiData.logoSize);
    });
    guiData["logoPosZ"] = -10;
    logoGUI.add(guiData, "logoPosZ").name("Logo Position Z");
    guiData["logoAlpha"] = 1;
    logoGUI.add(guiData, "logoAlpha", 0, 1).name("Logo Transparency")
    .onChange(function () {
        setLogoTransparency(guiData.logoAlpha);
    });

    var cameraGUI = gui.addFolder("Camera");
    guiData["cameraDistanceZ"] = 10;
    cameraGUI.add(guiData, "cameraDistanceZ", 0, 50).name("Z distance");
    guiData["cameraFOV"] = 55;
    cameraGUI.add(guiData, "cameraFOV", 10, 90).name("Field of View")
    .onChange(function () {
        camera.fov = guiData.cameraFOV; camera.updateProjectionMatrix();
    });
    guiData["cameraRotationAngle"] = 20;
    cameraGUI.add(guiData, "cameraRotationAngle", 2, 179).name("Mouse rotation max angle");

    
    var holeGUI = gui.addFolder("Wormhole");
    guiData["holeSize"] = 10;
    holeGUI.add(guiData, "holeSize", 0, 100).name("size").onChange(function () {
        holeGroup.scale.set(guiData.holeSize, guiData.holeSize, guiData.holeSize);
    });
    guiData["wormholeRotationSpeed"] = 0;
    holeGUI.add(guiData, "wormholeRotationSpeed").name("lines rotation speed");
    guiData["wormholeFallingSpeed"] = 0.5;
    holeGUI.add(guiData, "wormholeFallingSpeed", 0, 3).name("circles falling speed");
    
    
    var modelsGUI = gui.addFolder("Models");
    guiData["spherePos"] = new THREE.Vector3();
    let spherePosGUI = modelsGUI.addFolder("sphere position");
    spherePosGUI.add(guiData.spherePos, "x", -10, 10);
    spherePosGUI.add(guiData.spherePos, "y", -10, 10);
    spherePosGUI.add(guiData.spherePos, "z", -10, 10);
    
    guiData["triplanarPos"] = new THREE.Vector3(-3,0,0);
    let triplanarPosGUI = modelsGUI.addFolder("triplanar position");
    triplanarPosGUI.add(guiData.triplanarPos, "x", -10, 10);
    triplanarPosGUI.add(guiData.triplanarPos, "y", -10, 10);
    triplanarPosGUI.add(guiData.triplanarPos, "z", -10, 10);
    
    guiData["orbitPos"] = new THREE.Vector3(3,0,0);
    let orbitPosGUI = modelsGUI.addFolder("orbit position");
    orbitPosGUI.add(guiData.orbitPos, "x", -10, 10);
    orbitPosGUI.add(guiData.orbitPos, "y", -10, 10);
    orbitPosGUI.add(guiData.orbitPos, "z", -10, 10);

    //gui.closed = true;

    // GUI
}

function setLogoTransparency(f)
{
    logoGroup.visible = f != 0;
    for (let i = 0; i < logoMaterials.length; ++i)
    {
        const m = logoMaterials[i];
        m.transparent = f < 1;
        m.opacity = f;
    }
}


function resizeRendererToDisplaySize(renderer) {
    
    const canvas = renderer.domElement;
    const pixelRatio = window.devicePixelRatio;
    const width = window.innerWidth * pixelRatio | 0;
    const height = window.innerHeight * pixelRatio | 0;
    const needResize = canvas.width !== width || canvas.height !== height;
    if (needResize) {
        renderer.setPixelRatio(window.devicePixelRatio);
        renderer.setSize(window.innerWidth, window.innerHeight);
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        if (piecesMaterial !== undefined && piecesMaterial != null)
            piecesMaterial.uniforms.screenRatio.value = width / height;
    }
    return needResize;
}

let time = 0;
function animate() {

    requestAnimationFrame(animate);

    var now = Date.now();
    var deltaTime = Math.min(1 / 15, (now - lastUpdate) / 1000);
    lastUpdate = now;

    if (filesWaitingToLoad == 0)
    {
        time += deltaTime;
        update(deltaTime);
        render();
        stats.update();
    }
}

function render() {
    if (resizeRendererToDisplaySize(renderer)) {
        //console.log("canvas resized to ", window.innerWidth, window.innerHeight);
    }

    renderer.render(scene, camera);
}

function update(deltaTime) {
    camera.position.z = guiData.cameraDistanceZ;

    cameraPivot.quaternion.setFromEuler(new THREE.Euler(
        THREE.MathUtils.degToRad(mouseNormalizedPos.y * guiData.cameraRotationAngle),
        THREE.MathUtils.degToRad(mouseNormalizedPos.x * guiData.cameraRotationAngle),
        0));

    // Shaking

    if (cameraShakeIntensity > 0)
    {
        let eulerAngles = new THREE.Euler();
        let intensity_sq = cameraShakeIntensity * cameraShakeIntensity;
        let t = time * guiData.cameraShakeSpeed;

        eulerAngles.x = intensity_sq * guiData.cameraShakePitch * 0.0174533 * 2 * (noise.simplex2(cameraShakeSeed, t) - 0.5); // deg to rad = 0.0174533
        eulerAngles.y = intensity_sq * guiData.cameraShakeYaw * 0.0174533 * 2 * (noise.simplex2(cameraShakeSeed + 1, t) - 0.5);
        eulerAngles.z = intensity_sq * guiData.cameraShakeRoll * 0.0174533 * 2 * (noise.simplex2(cameraShakeSeed + 2, t) - 0.5);

        camera.quaternion.setFromEuler(eulerAngles);
    }
    else {
        camera.quaternion.identity();
    }
    
    logoPivot.position.z = guiData.logoPosZ;
    
    // Wormhole lines
    var wormholeAxis = new THREE.Vector3(0,1,0);
    for (let i = 0; i < wormholeLines.length; ++i) {
        var r = time * (i + 1)/wormholeLines.length * Math.PI * guiData.wormholeRotationSpeed;
        if (i % 2 == 0) r = -r;
        wormholeLines[i].quaternion.setFromAxisAngle(wormholeAxis, r);
    }

    // Wormhole circles
    let holeDepth = time * guiData.wormholeFallingSpeed;
    let holeFactor = holeDepth / distanceBetweenCircles;
    holeFactor = holeFactor - Math.floor(holeFactor);

    for (let i = 0; i < wormholeCircles.length; ++i)
    {
        const depth = (-i - 1 - holeFactor) * distanceBetweenCircles;
        const radius = THREE.MathUtils.lerp(circleRadiusMax, circleRadiusMin, easing.easeOutQuad((i + holeFactor) / (numberOfCircles - 1)));
        wormholeCircles[i].scale.set(radius,radius,radius);
        wormholeCircles[i].position.setY(depth);
    }

    // Models
    sphereModel.position.copy(guiData.spherePos);
    triplanarModel.position.copy(guiData.triplanarPos);
    orbitModel.position.copy(guiData.orbitPos);
}

function mousemove(e) {
    let rect = canvas.getBoundingClientRect(),
    x = e.clientX - rect.left,
    y = e.clientY - rect.top;

    mouseNormalizedPos.x = ((x / canvas.width) - 0.5) * 2;
    mouseNormalizedPos.y = ((y / canvas.height) - 0.5) * 2;

    //console.log(mouseNormalizedPos);
}

document.addEventListener("mousemove", mousemove);