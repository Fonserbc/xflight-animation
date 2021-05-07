"use strict";

import * as THREE from './lib/three.js';
import { SVGLoader } from "./lib/SVGLoader.js";
import { GUI } from "./lib/dat.gui.js";
import Stats from "./lib/stats.js";
import easing from "./lib/easings.js";

var canvas, stats, camera, scene, renderer, rocks, centerArrow, arrow, gui, guiData;
var animationTime = 0;
var DEBUG_plane;

var lerp = function (f, t, a) {
    return f * (1 - a) + t * a;
}

init();
var lastUpdate = Date.now();
animate();

function init() {

    guiData = {
        spaceshipLogoSize: 1,
        totalAnimationTime: 5,
        cameraStartY: 5,
        cameraDistanceZ: 30,
        cameraEndY: 15,
        cameraFOV: 50,
        spaceshipStartY: -10,
        spaceshipEndY: 15,
        holeSize: 30,
        DEBUG_PLANE: true,
        DEBUG_RESIZABLE_WINDOW: false
    }

    stats = new Stats();
    document.getElementById('container').appendChild(stats.dom);
    scene = new THREE.Scene();

    camera = new THREE.PerspectiveCamera(guiData.cameraFOV, window.innerWidth / window.innerHeight, 1, 1000);
    camera.position.z = guiData.cameraDistanceZ;
    camera.position.y = guiData.cameraStartY;
    scene.add(camera);

    createDebugGUI();

    // DEBUG plane helper
    const floorPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0.02);
    DEBUG_plane = new THREE.PlaneHelper(floorPlane, 50, 0x11cc00);
    if (guiData.DEBUG_PLANE) scene.add(DEBUG_plane);

    // moving arrow

    arrow = new THREE.Object3D();
    scene.add(arrow);

    // rendering

    canvas = document.querySelector('#c');
    renderer = new THREE.WebGLRenderer({
        canvas: canvas,
        alpha: true
        //antialias: true

    });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(window.innerWidth, window.innerHeight);

    document.body.appendChild(renderer.domElement);

    const bgTexture = new THREE.TextureLoader().load('res/bg_starfield2x.jpg');
    bgTexture.wrapS = THREE.MirroredRepeatWrapping;
    bgTexture.wrapT = THREE.MirroredRepeatWrapping;

    const invisibleMaterial = new THREE.MeshBasicMaterial({ colorWrite: false });
    const piecesMaterial = new THREE.MeshLambertMaterial({ envMap: bgTexture });//new THREE.MeshBasicMaterial({ color: 0x111111, map: bgTexture });

    // SVGs

    const loader = new SVGLoader();

    loader.load("res/arrow_ship.svg",
        function (data) {
            const paths = data.paths;
            const path = paths[0];
            const material = new THREE.MeshBasicMaterial({
                color: path.color
            });
            const shapes = SVGLoader.createShapes(path);
            const shape = shapes[0];
            const geometry = new THREE.ShapeGeometry(shape);

            const positions = geometry.attributes.position;

            var extents = {
                x: { min: Number.POSITIVE_INFINITY, max: Number.NEGATIVE_INFINITY },
                y: { min: Number.POSITIVE_INFINITY, max: Number.NEGATIVE_INFINITY }
            };
            for (let i = 0; i < positions.array.length;) {
                let x = positions.array[i];
                let y = positions.array[i + 1];

                //console.log(`arrow path (${x}, ${y})`);

                if (x < extents.x.min) extents.x.min = x;
                if (x > extents.x.max) extents.x.max = x;
                if (y < extents.y.min) extents.y.min = y;
                if (y > extents.y.max) extents.y.max = y;

                i += positions.itemSize;
            }
            arrow.extents = extents;

            arrow.resizeArrow = function (s) {
                var size = s / (arrow.extents.y.max - arrow.extents.y.min);
                arrow.meshObject.scale.set(size, size, size);
                arrow.meshObject.position.set((arrow.extents.x.max - arrow.extents.x.min) * 0.5 * size, (arrow.extents.y.max - arrow.extents.y.min) * 0.5 * size, 0);
            }
            arrow.meshObject = new THREE.Mesh(geometry, material);
            arrow.add(arrow.meshObject);
            arrow.meshObject.setRotationFromAxisAngle(new THREE.Vector3(0, 0, -1), Math.PI);
            arrow.resizeArrow(guiData.spaceshipLogoSize);
        }
    );
    loader.load("res/Wormhole_Cutouthole.svg",
        function (data) {
            const paths = data.paths;
            rocks = new THREE.Group();
            var extents = {
                x: { min: Number.POSITIVE_INFINITY, max: Number.NEGATIVE_INFINITY },
                y: { min: Number.POSITIVE_INFINITY, max: Number.NEGATIVE_INFINITY }
            };

            for (let i = 0; i < paths.length; ++i) {
                const path = paths[i];
                const material = new THREE.MeshBasicMaterial({
                    color: path.color,
                    side: THREE.DoubleSide
                });
                const shapes = SVGLoader.createShapes(path);

                //console.log(`path ${i} has ${shapes.length} shapes`);

                for (let j = 0; j < shapes.length; ++j) {
                    const shape = shapes[j];
                    const geometry = new THREE.ShapeGeometry(shape);

                    const positions = geometry.attributes.position;

                    for (let p = 0; p < positions.array.length;) {
                        let x = positions.array[p];
                        let y = positions.array[p + 1];

                        if (x < extents.x.min) extents.x.min = x;
                        if (x > extents.x.max) extents.x.max = x;
                        if (y < extents.y.min) extents.y.min = y;
                        if (y > extents.y.max) extents.y.max = y;

                        p += positions.itemSize;
                    }

                    const mesh = new THREE.Mesh(geometry, i == 0 ? invisibleMaterial : piecesMaterial);
                    mesh.position.z = i*3;
                    rocks.add(mesh);
                    if (i == 0) {
                        // This is the triangle that is going to block the bottom side
                        const frontBlocker = new THREE.BufferGeometry();
                        const vertices = new Float32Array([
                            extents.x.min, extents.y.min, 0,
                            (extents.x.min + extents.x.max) * 0.5, extents.y.min, -1000,
                            extents.x.max, extents.y.min, 0
                        ]);
                        frontBlocker.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
                        rocks.add(new THREE.Mesh(frontBlocker, invisibleMaterial));
                    }
                }
            }
            rocks.setRotationFromAxisAngle(new THREE.Vector3(-1, 0, 0), Math.PI * 0.5);
            rocks.extents = extents;
            rocks.resizeHole = function (s) {
                var size = s / (rocks.extents.x.max - rocks.extents.x.min);
                rocks.scale.set(size, size, size);
                rocks.position.set(-(rocks.extents.x.max - rocks.extents.x.min) * 0.5 * size, 0, (rocks.extents.y.max - rocks.extents.y.min) * 0.5 * size);

            };
            rocks.resizeHole(guiData.holeSize);
            scene.add(rocks);
        }
    );
}

function createDebugGUI ()
{
    if (gui) gui.destroy();

    gui = new GUI({ width: 350 });

    // GUI

    gui.add(guiData, "spaceshipLogoSize", 0.001, 20).name("Spaceship-Logo Size").onChange(function () { arrow.resizeArrow(guiData.spaceshipLogoSize); });
    gui.add(guiData, "totalAnimationTime", 1, 40).name("Animation Time").onChange(restart);
    var cameraGUI = gui.addFolder("Camera");
    cameraGUI.add(guiData, "cameraFOV", 10, 90).name("Field of View").onChange(function () { camera.fov = guiData.cameraFOV; camera.updateProjectionMatrix(); });
    cameraGUI.add(guiData, "cameraDistanceZ", 0.5, 100).name("Z distance").onChange(function () { camera.position.z = guiData.cameraDistanceZ; });
    cameraGUI.add(guiData, "cameraStartY").name("start Y position").onChange(restart);
    cameraGUI.add(guiData, "cameraEndY").name("end Y position").onChange(restart);
    var spaceshipGUI = gui.addFolder("Spaceship");
    spaceshipGUI.add(guiData, "spaceshipStartY").name("start Y position").onChange(restart);
    spaceshipGUI.add(guiData, "spaceshipEndY").name("end Y position").onChange(restart);
    var holeGUI = gui.addFolder("Wormhole");
    holeGUI.add(guiData, "holeSize", 0, 100).name("Hole Size").onChange(function () {
        rocks.resizeHole(guiData.holeSize);
        restart();
    });

    var debugGUI = gui.addFolder("DEBUG");
    debugGUI.add(guiData, "DEBUG_RESIZABLE_WINDOW").name("Resizable Window");
    debugGUI.add(guiData, "DEBUG_PLANE").name("Show debug plane").onChange(function () {
        if (guiData.DEBUG_PLANE)
            scene.add(DEBUG_plane);
        else scene.remove(DEBUG_plane);
    });

    // GUI
}


function resizeRendererToDisplaySize(renderer) {
    const canvas = renderer.domElement;
    const pixelRatio = window.devicePixelRatio;
    const width = canvas.clientWidth * pixelRatio | 0;
    const height = canvas.clientHeight * pixelRatio | 0;
    const needResize = canvas.width !== width || canvas.height !== height;
    if (needResize) {
        renderer.setSize(width, height, false);
    }
    return needResize;
}

function animate() {

    requestAnimationFrame(animate);

    var now = Date.now();
    var deltaTime = Math.min(1 / 15, (now - lastUpdate) / 1000);
    lastUpdate = now;

    update(deltaTime);
    render();
    stats.update();
}

function render() {
    if (guiData.resizableWindow && resizeRendererToDisplaySize(renderer)) {
        const canvas = renderer.domElement;
        camera.aspect = canvas.clientWidth / canvas.clientHeight;
        camera.updateProjectionMatrix();
    }

    renderer.render(scene, camera);
}

function update(deltaTime) {
    animationTime += deltaTime;

    const animationFactor = Math.max(0, Math.min(1, animationTime / guiData.totalAnimationTime));

    arrow.position.y = lerp(guiData.spaceshipStartY, guiData.spaceshipEndY, easing.easeOutExpo(animationFactor));
    camera.position.y = lerp(guiData.cameraStartY, guiData.cameraEndY, easing.easeInOutSine(animationFactor));
}

function restart() {
    animationTime = 0;
}

canvas.addEventListener("mousedown", restart);