"use strict";

import * as THREE from './lib/three.js';
import { SVGLoader } from "./lib/SVGLoader.js";
import { GUI } from "./lib/dat.gui.js";
import Stats from "./lib/stats.js";
import easing from "./lib/easings.js";

var canvas, stats, camera, scene, renderer, rocks, arrow, trail, gui, guiData;
var filesWaitingToLoad = 0;

var bgScene, bgCamera;

var trail, trailGeometry, trailPositions = [], trailFrameCount = 64, trailIndex = 0;

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

init();
var lastUpdate = Date.now();
animate();

function init() {
    
    const DEPTH_PIECES = 5;

    guiData = {
        spaceshipLogoSize: 1,
        totalAnimationTime: 10,
        cameraStartY: 25,
        cameraDistanceZ: 25,
        cameraEndY: 20,
        cameraFOV: 50,
        cameraStartLookingAtShipFactor: 0.06,
        cameraStartLookingAtHeight: 5,
        spaceshipStartY: -10,
        spaceshipEndY: 20,
        holeSize: 30,
        piecesSpeedFriction: 0.1,
        piecesRotationFriction: 0.03,
        DEBUG_PLANE: false,
        DEBUG_RESIZABLE_WINDOW: false
    }
    // rendering
    
    canvas = document.querySelector('#c');
    renderer = new THREE.WebGL1Renderer({
        canvas: canvas,
        alpha: true
        //antialias: true
    
    });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(window.innerWidth, window.innerHeight);

    stats = new Stats();
    document.getElementById('stats').appendChild(stats.dom);
    
    // Main Scene
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

    

    document.body.appendChild(renderer.domElement);

    const bgTexture = new THREE.TextureLoader().load('res/bg_starfield2x.jpg');
    bgTexture.wrapS = THREE.MirroredRepeatWrapping;
    bgTexture.wrapT = THREE.MirroredRepeatWrapping;
    bgTexture.mapping = THREE.EquirectangularReflectionMapping;
    bgTexture.minFilter = THREE.NearestFilter;
    //scene.background = bgTexture;

    // MATERIALS
    
    const invisibleMaterial = new THREE.MeshBasicMaterial({ colorWrite: false });
    const oldPiecesMaterial = new THREE.MeshBasicMaterial({
        color: 0xdddddd,
        reflectivity: 1,
        envMap: bgTexture,
        side: THREE.DoubleSide,
        combine: THREE.MultiplyOperation
    });
    const piecesMaterial = new THREE.ShaderMaterial({
        //side: THREE.DoubleSide,
        uniforms: {
            screenRatio: { value: window.innerWidth / window.innerHeight},
            textureRatio: {value: 1.4145 }, // TODO update this ratio if we change the BG image
            bgTexture: {value: bgTexture}
        },
        vertexShader: document.getElementById( 'vertexShaderPieces' ).textContent,
        fragmentShader: document.getElementById( 'fragmentShaderPieces' ).textContent
    });
    const wormlinesMaterial = new THREE.LineBasicMaterial({
        color: 0x00ff00,
        linewidth: 3
    });
    const outlineMaterial = new THREE.LineBasicMaterial({
        color: 0xffffff,
        linewidth: 3
    });

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
            
            // trail
            while (trailIndex < trailFrameCount)
            {
                
                trailPositions.push(arrow.position.clone());
                trailIndex++;
            }
            trailIndex = 0;
            var trailVertices = [];
            trailVertices.push(trailPositions[0].clone());
            trailVertices.push(trailPositions[0].clone());
            trailGeometry = new THREE.BufferGeometry().setFromPoints(trailVertices);
            // trail
            
            trail = new THREE.LineSegments(trailGeometry, wormlinesMaterial);
            scene.add(trail);
            
            
            filesWaitingToLoad--;
        }
    );
    filesWaitingToLoad++;
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
                        
                        // White outline hole
                        var outlinePositions = [];
                        for (let x = 12; x < geometry.attributes.position.array.length; ++x) // This is set by hand
                        {
                            if (x % 3 == 1) outlinePositions.push(geometry.attributes.position.array[x] + 1); // for zfighting
                            else outlinePositions.push(geometry.attributes.position.array[x]);
                        }
                        const outlineGeometry = new THREE.BufferGeometry();
                        outlineGeometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array(outlinePositions), 3) );
                        console.log(outlineGeometry);
                        const outlineMesh = new THREE.LineLoop(outlineGeometry, outlineMaterial);
                        rocks.add(outlineMesh);
                        
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
                        
                        // Make pieces 3D
                        var positionAttribute = geometry.getAttribute("position");
                        const vertexArrayLength = positionAttribute.array.length;
                        const vertexCount = vertexArrayLength / 3;
                        var newPositions = new Float32Array(vertexArrayLength * 2);
                        
                        for (let j = 0; j < vertexArrayLength; j += 3)
                        {
                            newPositions[j] = newPositions[j + vertexArrayLength] = positionAttribute.array[j];
                            newPositions[j + 1] = positionAttribute.array[j + 1];
                            newPositions[j + 1 + vertexArrayLength] = positionAttribute.array[j + 1] - DEPTH_PIECES;
                            newPositions[j + 2] = newPositions[j + 2 + vertexArrayLength] = positionAttribute.array[j + 2];
                        }
                        var indices = [];
                        for (let j = 0; j < geometry.index.count; ++j)
                        {
                            indices.push(geometry.index.array[j]);
                        }
                        for (let j = 0; j < geometry.index.count; j += 3)
                        {
                            indices.push(geometry.index.array[j] + vertexCount);
                            indices.push(geometry.index.array[j + 2] + vertexCount);
                            indices.push(geometry.index.array[j + 1] + vertexCount);
                        }
                        for (let j = 0; j < vertexCount; ++j)
                        {
                            const next = (j+1)%vertexCount;
                            const down = j + vertexCount;
                            const downNext = next + vertexCount;
                            indices.push(j, next, down);
                            indices.push(down, next, downNext);
                        }
                        
                        geometry.setAttribute("position", new THREE.Float32BufferAttribute(newPositions, 3));
                        geometry.deleteAttribute("uv");
                        geometry.deleteAttribute("normal");
                        geometry.setIndex(indices);
                        //
                        
                        geometry.computeVertexNormals();
                        
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
            
            const circleSegments = 18;
            const numberOfCircles = 10;
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
            
            filesWaitingToLoad--;
        }
    );
    filesWaitingToLoad++;
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
    cameraGUI.add(guiData, "cameraStartLookingAtShipFactor").name("LookAtShipStartAnim %");
    cameraGUI.add(guiData, "cameraStartLookingAtHeight").name("Start lookAt height");
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

    if (filesWaitingToLoad == 0)
    {
        update(deltaTime);
        render();
        stats.update();
    }
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
    
    // update trail
    trailPositions[trailIndex].copy(arrow.position);
    trailIndex = (trailIndex + 1)%trailPositions.length;
    
    const lastTrailIndex = (trailIndex + trailPositions.length - 1)%trailPositions.length;
    
    trailGeometry.attributes.position.array[0] = trailPositions[trailIndex].x;
    trailGeometry.attributes.position.array[1] = trailPositions[trailIndex].y - 0.1;
    trailGeometry.attributes.position.array[2] = trailPositions[trailIndex].z - 0.1;
    trailGeometry.attributes.position.array[3] = trailPositions[lastTrailIndex].x;
    trailGeometry.attributes.position.array[4] = trailPositions[lastTrailIndex].y - 0.1;
    trailGeometry.attributes.position.array[5] = trailPositions[lastTrailIndex].z - 0.1;
    trailGeometry.attributes.position.needsUpdate = true;
    
    if (animationFactor < guiData.cameraStartLookingAtShipFactor)
    {
        camera.lookAt(new THREE.Vector3(0,guiData.cameraStartLookingAtHeight,0));
    }
    else {
        const lookFactor = (animationFactor - guiData.cameraStartLookingAtShipFactor)/(1 - guiData.cameraStartLookingAtShipFactor);
        var lookAtPoint = new THREE.Vector3(
            0,
            THREE.Math.lerp(guiData.cameraStartLookingAtHeight, arrow.position.y, easing.easeInOutCubic(lookFactor)),
            0
        );
        camera.lookAt(lookAtPoint);
    }
    
    arrow.quaternion.copy(camera.quaternion);
    
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
    
    arrow.position.y = guiData.spaceshipStartY;
    trailIndex = 0;
    while (trailIndex < trailFrameCount)
    {
        trailPositions[trailIndex].copy(arrow.position);
        trailIndex++;
    }
    trailIndex = 0;
}

canvas.addEventListener("mousedown", restart);