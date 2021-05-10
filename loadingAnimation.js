"use strict";

import * as THREE from './lib/three.js';
import { SVGLoader } from "./lib/SVGLoader.js";
import { GUI } from "./lib/dat.gui.js";
import Stats from "./lib/stats.js";
import easing from "./lib/easings.js";

var canvas, stats, camera, scene, renderer, rocks, arrow, gui, guiData;
var animationTime = 0;
var DEBUG_plane;

var pieces = [];

var moveTowards = function(from, to, delta)
{
    if (from < to) {
        return Math.min(to, from + delta);
    }
    else {
        return Math.max(to, from - delta);
    }
}

var computeBoundingBox = function (array)
{
    var box = new THREE.Box3();
    
    for (let i = 0; i < array.length; i += 3)
    {
        box.min.setX(Math.min(box.min.x, array[i]));
        box.max.setX(Math.max(box.max.x, array[i]));
        box.min.setY(Math.min(box.min.y, array[i + 1]));
        box.max.setY(Math.max(box.max.y, array[i + 1]));
        box.min.setZ(Math.min(box.min.z, array[i + 2]));
        box.max.setZ(Math.max(box.max.z, array[i + 2]));
    }
    return box;
}

init();
var lastUpdate = Date.now();
animate();

function init() {

    guiData = {
        spaceshipLogoSize: 1,
        totalAnimationTime: 10,
        cameraStartY: 5,
        cameraDistanceZ: 35,
        cameraEndY: 15,
        cameraFOV: 60,
        spaceshipStartY: -10,
        spaceshipEndY: 15,
        holeSize: 30,
        piecesSpeedFriction: 0.1,
        piecesRotationFriction: 0.03,
        DEBUG_PLANE: false,
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
    const piecesMaterial = new THREE.MeshBasicMaterial({ color: 0x330000, side: THREE.DoubleSide });

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
            
            const containerPathIt = 0;
            // if the containerPathIt != 0, we should compute container displacement beforehand
            var containerDisplacement = new THREE.Vector3();

            for (let i = 0; i < paths.length; ++i) {
                const path = paths[i];
                const shapes = SVGLoader.createShapes(path);

                //console.log(`path ${i} has ${shapes.length} shapes`);

                for (let j = 0; j < shapes.length; ++j) {
                    const shape = shapes[j];
                    const geometry = new THREE.ShapeGeometry(shape);
                    geometry.rotateX(Math.PI * -0.5);
                    
                    if (i == containerPathIt) {
                        // Vertex corrections
                        geometry.computeBoundingBox();
                        //geometry.boundingBox = computeBoundingBox(geometry.attributes.position.array);
                        containerDisplacement = new THREE.Vector3();
                        geometry.boundingBox.getCenter(containerDisplacement);
                        containerDisplacement.multiplyScalar(-1);
                        
                        geometry.translate(containerDisplacement.x, containerDisplacement.y, containerDisplacement.z);
                        geometry.computeBoundingBox();
                        rocks.boundingBox = geometry.boundingBox.clone();
                        
                        const mesh = new THREE.Mesh(geometry, invisibleMaterial);
                        rocks.add(mesh);
                        
                        // This is the triangle that is going to block the bottom side
                        const frontBlocker = new THREE.BufferGeometry();
                        const vertices = new Float32Array([
                            geometry.boundingBox.min.x, geometry.boundingBox.min.y, geometry.boundingBox.max.z,
                            (geometry.boundingBox.min.x + geometry.boundingBox.max.x) * 0.5, geometry.boundingBox.min.y - 1000, geometry.boundingBox.max.z,
                            geometry.boundingBox.max.x, geometry.boundingBox.min.y, geometry.boundingBox.max.z
                        ]);
                        frontBlocker.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
                        rocks.add(new THREE.Mesh(frontBlocker, invisibleMaterial));
                        
                        const backBlocker = new THREE.BufferGeometry();
                        const backVertices = new Float32Array([
                            geometry.boundingBox.min.x, geometry.boundingBox.min.y, geometry.boundingBox.min.z,
                            (geometry.boundingBox.min.x + geometry.boundingBox.max.x) * 0.5, geometry.boundingBox.min.y - 1000, geometry.boundingBox.min.z,
                            geometry.boundingBox.max.x, geometry.boundingBox.min.y, geometry.boundingBox.min.z
                        ]);
                        backBlocker.setAttribute('position', new THREE.BufferAttribute(backVertices, 3));
                        rocks.add(new THREE.Mesh(backBlocker, new THREE.MeshBasicMaterial({color: 0x000000})));
                    }
                    else { // Add the rocks as pieces for movement
                        geometry.translate(containerDisplacement.x, containerDisplacement.y, containerDisplacement.z);
                        geometry.computeBoundingBox();
                        var pieceDisplacement = new THREE.Vector3();
                        geometry.boundingBox.getCenter(pieceDisplacement);
                        
                        const pivot = new THREE.Object3D();
                        rocks.add(pivot);
                        pivot.position.set(pieceDisplacement.x, pieceDisplacement.y, pieceDisplacement.z);
                        geometry.translate(-pieceDisplacement.x, -pieceDisplacement.y, -pieceDisplacement.z);
                        
                        const mesh = new THREE.Mesh(geometry, false ? invisibleMaterial : piecesMaterial);
                        // TODO assign material depending on moving
                        pivot.add(mesh);
                        
                        //console.log(pivot);
                        
                        var vel = pieceDisplacement.clone();
                        vel.y = 45;
                        vel.normalize();
                        
                        var piece = {
                            object3D: pivot,
                            originalPosition: pieceDisplacement,
                            moving: true,
                            rotationAxis: new THREE.Vector3().random().normalize(),
                            rotationSpeed: 0,
                            velocity: vel,
                            speed: 0,
                            
                            init: function () {
                                this.object3D.position.copy(this.originalPosition);
                                this.object3D.quaternion.identity();
                                
                                var receivedSpeed = easing.easeInCirc(Math.abs(this.velocity.y));
                                
                                
                                this.rotationSpeed = receivedSpeed * (2 + THREE.MathUtils.lerp(-1, 1, Math.random()));
                                this.speed = receivedSpeed * (50 + THREE.MathUtils.lerp(-5, 5, Math.random()));
                            }
                        }
                        piece.init();
                        pieces.push(piece);
                    }
                }
            }
            
            // wormhole circles and lines
            const wormlinesMaterial = new THREE.LineBasicMaterial({
                color: 0x00ff00
            });
            
            const circleSegments = 18;
            const numberOfCircles = 5;
            const circleRadiusMax = (rocks.boundingBox.max.x - rocks.boundingBox.min.x) * 0.25;
            const circleRadiusMin = circleRadiusMax * 0.3;
            const distanceBetweenCircles = circleRadiusMax * 0.1;
            var rocksCenter = new THREE.Vector3();
            rocks.boundingBox.getCenter(rocksCenter);
            
            var allCirclePoints = [];
            for(let i = 0; i < numberOfCircles; ++i)
            {
                const points = [];
                const radius = THREE.MathUtils.lerp(circleRadiusMax, circleRadiusMin, easing.easeOutQuad(i / (numberOfCircles - 1)));
                const depth = (-i - 1) * distanceBetweenCircles;
                for (let j = 0; j < circleSegments + 1; ++j)
                {
                    var angle = j * Math.PI * 2 / circleSegments;
                    points.push(new THREE.Vector3(Math.cos(angle) * radius, depth, Math.sin(angle) * radius).add(rocksCenter));
                }
                const wormholeGeometry = new THREE.BufferGeometry().setFromPoints( points );
                const line = new THREE.Line( wormholeGeometry, wormlinesMaterial );
                
                allCirclePoints.push(points);
                rocks.add(line);
            }
            
            const verticalLineEveryN = 3;
            for (let i = 0; i < circleSegments; i += verticalLineEveryN)
            {
                const points = [];
                for (let j = 0; j < allCirclePoints.length; ++j)
                {
                    points.push(allCirclePoints[j][i]);
                }
                const wormholeVerticalGeometry = new THREE.BufferGeometry().setFromPoints( points );
                const line = new THREE.Line( wormholeVerticalGeometry, wormlinesMaterial );
                rocks.add(line);
            }
            
            rocks.resizeHole = function (s) {
                var size = s / (rocks.boundingBox.max.x - rocks.boundingBox.min.x);
                rocks.scale.set(size, size, size);

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
    var rocksGUI = gui.addFolder("Rocks");
    rocksGUI.add(guiData, "piecesSpeedFriction", 0, 10).name("translation friction");
    rocksGUI.add(guiData, "piecesRotationFriction", 0, 2).name("rotation friction");
    // TODO rocks rotation and speed GUI
    
    
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

    arrow.position.y = THREE.MathUtils.lerp(guiData.spaceshipStartY, guiData.spaceshipEndY, easing.easeOutExpo(animationFactor));
    camera.position.y = THREE.MathUtils.lerp(guiData.cameraStartY, guiData.cameraEndY, easing.easeInOutSine(animationFactor));
    
    //camera.lookAt(arrow.position);
    
    for (let i = 0; i < pieces.length; ++i)
    {
        const p = pieces[i];
        if (p.moving)
        {
            p.speed = moveTowards(p.speed, 0, deltaTime * guiData.piecesSpeedFriction);
            p.rotationSpeed = moveTowards(p.rotationSpeed, 0, deltaTime * guiData.piecesRotationFriction);
            
            var translation = new THREE.Vector3().copy(p.velocity).multiplyScalar(p.speed * deltaTime);
            
            p.object3D.position.add(translation);
            
            translation.copy(p.object3D.position)
            p.object3D.applyQuaternion(new THREE.Quaternion().setFromAxisAngle(p.rotationAxis, p.rotationSpeed * deltaTime));
                
            //if (i == 0) console.log(p.object3D.quaternion);
        }
    }
}

function restart() {
    animationTime = 0;
    
    for (let i = 0; i < pieces.length; ++i)
    {
        pieces[i].init();
    }
}

canvas.addEventListener("mousedown", restart);