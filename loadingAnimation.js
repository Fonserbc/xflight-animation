"use strict";

import * as THREE from './lib/three.js';
import { SVGLoader } from "./lib/SVGLoader.js";
import { GUI } from "./lib/dat.gui.js";
import Stats from "./lib/stats.js";
import easing from "./lib/easings.js";

var canvas, stats, camera, scene, renderer, material, centerArrow, arrow, gui, guiData;
var animationTime = 0;

var lerp = function (f, t, a) {
    return f * (1 - a) + t * a;
}

init();
var lastUpdate = Date.now();
animate();

function init() {

    stats = new Stats();
    document.getElementById('container').appendChild(stats.dom);
    scene = new THREE.Scene();

    camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 1, 100);
    camera.position.z = 30;
    camera.position.y = 5;
    scene.add(camera);

    createDebugGUI();

    // DEBUG
    // center debug arrow
    const centerArrowGeometry = new THREE.BufferGeometry();
    const vertices = new Float32Array([
        -1.0, 2.2, 0,
        0, 0, 0,
        0.0, 1.8, 0,

        1.0, 2.2, 0,
        0.0, 1.8, 0,
        0, 0, 0
    ]);
    centerArrowGeometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
    material = new THREE.MeshBasicMaterial({
        color: 0xffffbb,
        transparent: true,
        opacity: 0.75
    });

    centerArrow = new THREE.Mesh(centerArrowGeometry, material);
    // plane helper
    const floorPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    const helper = new THREE.PlaneHelper(floorPlane, 50, 0x11cc00);
    scene.add(helper);

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
    });
}

function createDebugGUI ()
{
    if (gui) gui.destroy();

    gui = new GUI({ width: 350 });

    guiData = {
        spaceshipLogoSize: 1,
        totalAnimationTime: 5,
        cameraStartY: 5,
        cameraEndY: 15,
        spaceshipStartY: -10,
        spaceshipEndY: 15,
        DEBUG_CENTER_SCREEN: false,
        DEBUG_RESIZABLE_WINDOW: false
    }

    // GUI

    gui.add(guiData, "spaceshipLogoSize", 0.001, 20).name("Spaceship-Logo Size").onChange(function () { arrow.resizeArrow(guiData.spaceshipLogoSize); });
    gui.add(guiData, "totalAnimationTime", 1, 40).name("Animation Time").onChange(restart);
    var cameraGUI = gui.addFolder("Camera");
    cameraGUI.add(guiData, "cameraStartY").name("start Y position").onChange(restart);
    cameraGUI.add(guiData, "cameraEndY").name("end Y position").onChange(restart);
    var spaceshipGUI = gui.addFolder("Spaceship");
    spaceshipGUI.add(guiData, "spaceshipStartY").name("start Y position").onChange(restart);
    spaceshipGUI.add(guiData, "spaceshipEndY").name("end Y position").onChange(restart);
    var debugGUI = gui.addFolder("DEBUG");
    debugGUI.add(guiData, "DEBUG_RESIZABLE_WINDOW").name("Resizable Window");
    debugGUI.add(guiData, "DEBUG_CENTER_SCREEN").name("Show screen center").onChange(function () {
        if (guiData.debugScreenCenter)
            scene.add(centerArrow);
        else scene.remove(centerArrow);
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