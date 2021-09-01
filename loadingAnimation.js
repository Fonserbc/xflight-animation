"use strict";

import * as THREE from './lib/three.js';
import { SVGLoader } from "./lib/SVGLoader.js";
import { GUI } from "./lib/dat.gui.js";
import Stats from "./lib/stats.js";
import easing from "./lib/easings.js";
import noise from "./lib/perlin.js";

let canvas, stats, camera, scene, renderer, arrow, gui, guiData;
let filesWaitingToLoad = 0;

let trail, trailGeometry, trailMaterial;
let lineTrail, lineTrailStart, lineTrailEnd, lineTrailMaterial;

let logoPivot, logoGroup, logoMaterials = [];

let holeOutlineMesh, rocks, wormholeLines = [], wormholeCircles = [], distanceBetweenCircles, circleRadiusMax, circleRadiusMin, numberOfCircles;
let pieces = [];
let sortedPieces = [];

let moon;

let animationTime = 0;
let DEBUG_plane;
let cameraShakeIntensity = 0;
let cameraShakeSeed = Math.random();
let rockCrashed = false;

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
    
    const DEPTH_PIECES = 3; // 3
    const OUTLINE_DISPLACEMENT = 0.5;

    guiData = {
        spaceshipLogoSize: 1,
        totalAnimationTime: 10,
        cameraStartY: 7,
        cameraDistanceZ: 25,
        cameraEndY: 17,
        cameraFOV: 55,
        cameraStartLookingAtShipFactor: 0.3,
        cameraStartLookingAtHeight: 5,
        cameraDoTilt: false,
        cameraShakePitch: 0.2,
        cameraShakeRoll: 0.3,
        cameraShakeYaw: 0.3,
        cameraShakeDecay: 1.2,
        cameraShakeSpeed: 15,
        cameraShakeStart: 0.5,
        spaceshipStartY: -10,
        spaceshipEndY: 20,
        spaceshipStartMovingFactor: 0.25,
        holeSize: 30,
        piecesSpeedFriction: 0.41,
        piecesRotationFriction: 0.112,
        piecesRotationSpeed: 4,
        piecesSpeed: 170,
        piecesVerticalMovementFactor: 96,
        startBreakingTime: 0.05,
        endBreakingTime: 0.25,
        piecesPostBreakStay: 0,
        piecesPostBreakAmount: 0.03,
        logoFadeinStart: 1,
        logoFadeinEnd: 1.3,
        moonSize: 22,
        moonRPM: 0.3,
        moonPositionY: 70,
        moonStartPositionY: 90,
        moonPositionZ: -60,
        doMoonGravity: false,
        moonGravity: 1000000,
        collideMoon: false,
        collisionBounciness: 0.3,
        wormholeRotationSpeed: 0,
        wormholeFallingSpeed: 20,
        trailLengthStart: 6,
        trailLengthEnd: 200,
        trailWidth: 2,
        trailRandomFactor: 0.5,
        trailEndFactor: 0.66,
        lineTrailWidth: 0.1,
        lineTrailAttachmentHeight: -0.7,
        lineTrailEndFactor: 0.80,
        lineTrailLengthStart: -50,
        lineTrailLengthEnd: 0,
        lineTrailRandomFactor: 0,
        DEBUG_PLANE: false,
        DEBUG_RESIZABLE_WINDOW: true
    }
    // rendering
    
    canvas = document.querySelector('#c');
    renderer = new THREE.WebGL1Renderer({
        canvas: canvas,
        alpha: true,
        extensions: {'OES_standard_derivatives': true}
        //antialias: true
    });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.getContext().getExtension('OES_standard_derivatives');
    document.body.appendChild(renderer.domElement);

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

    
    // MATERIALS
    
    const invisibleMaterial = new THREE.MeshBasicMaterial({ colorWrite: false });
    //const oldPiecesMaterial = new THREE.MeshBasicMaterial({
    //    color: 0xffffff,
    //    reflectivity: 1,
    //    envMap: envBGTexture
    //});
    const piecesMaterial = new THREE.ShaderMaterial({
        //side: THREE.DoubleSide,
        uniforms: {
            screenRatio: { value: window.innerWidth / window.innerHeight},
            textureRatio: {value: 1.7777 }, // TODO update this ratio if we change the BG image
            bgTexture: {value: null}
        },
        vertexShader: document.getElementById( 'vertexShaderPieces' ).textContent,
        fragmentShader: document.getElementById( 'fragmentShaderPieces' ).textContent,
        extensions: {derivatives: true}
    });

    const wormlinesMaterial = new THREE.LineBasicMaterial({
        color: 0x49FF5E,
        linewidth: 3
    });
    const outlineMaterial = new THREE.LineBasicMaterial({
        color: 0xffffff,
        linewidth: 3
    });
    const debugMaterial = new THREE.MeshBasicMaterial({color: 0xff00ff});
    const moonMaterial = new THREE.MeshBasicMaterial({map: null});

    const textureLoader = new THREE.TextureLoader();
    textureLoader.load('res/2021option_resized.jpg', function (bgTexture) {
        
        bgTexture.wrapS = THREE.MirroredRepeatWrapping;
        bgTexture.wrapT = THREE.MirroredRepeatWrapping;
        //bgTexture.mapping = THREE.EquirectangularReflectionMapping;
        bgTexture.minFilter = THREE.NearestFilter;
        
        piecesMaterial.uniforms.bgTexture.value = bgTexture;
        filesWaitingToLoad--;
    });
    filesWaitingToLoad++;
    
    textureLoader.load('res/moontexture-greenhue-2048h.jpg', function (texture) {
        moonMaterial.map = texture;
        //console.log("loaded moon", moonMaterial, texture);
        filesWaitingToLoad--;
    });
    filesWaitingToLoad++;
    
    // moon
    moon = new THREE.Mesh(new THREE.SphereGeometry(1,32,32), moonMaterial);
    //console.log(moon.geometry.attributes.position.array.length);
    moon.position.y = guiData.moonPositionY;
    moon.scale.set(guiData.moonSize, guiData.moonSize, guiData.moonSize);
    scene.add(moon);
    
    // logo
    logoPivot = new THREE.Object3D();
    logoPivot.position.y = guiData.spaceshipEndY + 0.12;
    scene.add(logoPivot);

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
                logoPivot.scale.set(s,s,s);
            }
            arrow.meshObject = new THREE.Mesh(geometry, material);
            arrow.add(arrow.meshObject);
            arrow.meshObject.setRotationFromAxisAngle(new THREE.Vector3(0, 0, -1), Math.PI);
            arrow.resizeArrow(guiData.spaceshipLogoSize);
            
            // trail
            
            var trailVertices = [];
            trailVertices.push(0, 0, 0);
            trailVertices.push(-1, -1, 0);
            trailVertices.push(1, -1, 0);
            
            trailGeometry = new THREE.BufferGeometry();
            trailGeometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(trailVertices), 3));
            
            //console.log(trailGeometry);
            
            trailMaterial = new THREE.ShaderMaterial({
                transparent: true,
                //blending: THREE.AdditiveBlending,
                //side: THREE.DoubleSide,
                uniforms: {
                    color: { value: new THREE.Color(0x49FF5E) }
                },
                vertexShader: document.getElementById( 'vertexTrail' ).textContent,
                fragmentShader: document.getElementById( 'fragmentTrail' ).textContent
            });
            // trail
            
            trail = new THREE.Mesh(trailGeometry, trailMaterial);// new THREE.LineSegments(trailGeometry, trailMaterial);
            trail.scale.set( 1, 10, 1 );
            //arrow.add(trail);
            trail.position.y = -.5;
            
            let lineTrailGeometry = new THREE.PlaneGeometry(1,1);
            //lineTrailGeometry.rotateX(-Math.PI * 0.5);
            lineTrailGeometry.translate(0,0.5,-1);
            
            lineTrailMaterial = new THREE.ShaderMaterial({
                transparent: true,
                uniforms: {
                    ratio: {value: 1},
                    color: {value: new THREE.Color(0x49FF5E)}
                },
                vertexShader: document.getElementById('vertexLine').textContent,
                fragmentShader: document.getElementById( 'fragmentLine' ).textContent
            });
            lineTrail = new THREE.Mesh(lineTrailGeometry, lineTrailMaterial);
            arrow.add(lineTrail);
            lineTrail.update = function(fromY, toY) {
                if (fromY > toY) {
                    let y = toY;
                    toY = fromY;
                    fromY = y;
                }
                let width = (1.0 - guiData.lineTrailRandomFactor + guiData.lineTrailRandomFactor * Math.random()) * guiData.lineTrailWidth;
                // fromY is less than toY
                lineTrail.scale.set(width, toY - fromY + width, 1);
                lineTrail.position.setY(fromY - width * 0.5 + guiData.lineTrailAttachmentHeight);
                
                lineTrailMaterial.uniforms.ratio.value = lineTrail.scale.x / lineTrail.scale.y;
                //console.log(lineTrailMaterial.uniforms.ratio.value);
            }
            
            lineTrailStart = -3;
            lineTrailEnd = -1;
            
            lineTrail.update(lineTrailStart, lineTrailEnd);
            
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
                        containerDisplacement.add(new THREE.Vector3(14,0,5));
                        
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
                        holeOutlineMesh = new THREE.LineLoop(outlineGeometry, outlineMaterial);
                        rocks.add(holeOutlineMesh);
                        holeOutlineMesh.visible = false;
                        
                        // This is the triangle that is going to block the bottom side
                        const frontBlocker = new THREE.BufferGeometry();
                        const vertices = new Float32Array([
                            geometry.boundingBox.min.x, geometry.boundingBox.min.y, geometry.boundingBox.max.z,
                            geometry.boundingBox.min.x, geometry.boundingBox.min.y - 1000, geometry.boundingBox.max.z,
                            geometry.boundingBox.max.x, geometry.boundingBox.min.y - 1000, geometry.boundingBox.max.z,
                            geometry.boundingBox.max.x, geometry.boundingBox.min.y, geometry.boundingBox.max.z
                        ]);
                        frontBlocker.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
                        frontBlocker.setIndex([0,1,3,1,2,3]);
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
                        var newPositions = new Float32Array(vertexArrayLength * 4);
                        var newNormals = new Float32Array(vertexArrayLength * 4);
                        
                        for (let j = 0; j < vertexArrayLength; j += 3)
                        {
                            // X is equal
                            newPositions[j] = newPositions[j + vertexArrayLength] = newPositions[j + vertexArrayLength * 2] = newPositions[j + vertexArrayLength * 3] = positionAttribute.array[j];
                            // Z is equal
                            newPositions[j + 2] = newPositions[j + 2 + vertexArrayLength] = newPositions[j + 2 + vertexArrayLength * 2] = newPositions[j + 2 + vertexArrayLength * 3] = positionAttribute.array[j + 2];
                            // Y is not
                            newPositions[j + 1] = newPositions[j + 1 + vertexArrayLength] = positionAttribute.array[j + 1];
                            newPositions[j + 1 + vertexArrayLength * 2] = newPositions[j + 1 + vertexArrayLength * 3] = positionAttribute.array[j + 1] - DEPTH_PIECES;
                            
                            newNormals[j] = newNormals[j + vertexArrayLength * 3] = 0;
                            newNormals[j + 1] = 1;
                            newNormals[j + 1 + vertexArrayLength * 3] = -1;
                            newNormals[j + 2] = newNormals[j + 2 + vertexArrayLength * 3] = 0;
                            
                            //var delta = new THREE.Vector2();
                            //delta.setX(positionAttribute.array[(j + 3) % vertexArrayLength] - positionAttribute.array[j]);
                            //delta.setY(positionAttribute.array[(j + 2 + 3) % vertexArrayLength] - positionAttribute.array[j + 2]);
                            
                            //var n = new THREE.Vector2(-delta.y, delta.x);
                            var n = new THREE.Vector2(positionAttribute.array[j], positionAttribute.array[j + 2]);
                            n.normalize();
                            
                            newNormals[j + vertexArrayLength] = newNormals[j + vertexArrayLength * 2] = n.x;
                            newNormals[j + 1 + vertexArrayLength] = newNormals[j + 1 + vertexArrayLength * 2] = 0;
                            newNormals[j + 2 + vertexArrayLength] = newNormals[j + 2 + vertexArrayLength * 2] = n.y;
                        }
                        var indices = [];
                        for (let j = 0; j < geometry.index.count; ++j)
                        {
                            indices.push(geometry.index.array[j]);
                        }
                        for (let j = 0; j < geometry.index.count; j += 3)
                        {
                            indices.push(geometry.index.array[j] + vertexCount * 3);
                            indices.push(geometry.index.array[j + 2] + vertexCount * 3);
                            indices.push(geometry.index.array[j + 1] + vertexCount * 3);
                        }
                        for (let j = 0; j < vertexCount; ++j)
                        {
                            const next = (j+1)%vertexCount + vertexCount;
                            const down = j + vertexCount * 2;
                            const downNext = next + vertexCount * 2;
                            indices.push(j, next, down);
                            indices.push(down, next, downNext);
                        }
                        
                        geometry.setAttribute("position", new THREE.Float32BufferAttribute(newPositions, 3));
                        geometry.setAttribute("normal", new THREE.Float32BufferAttribute(newNormals, 3));
                        //geometry.deleteAttribute("normal");
                        geometry.deleteAttribute("uv");
                        geometry.setIndex(indices);
                        //
                        
                        geometry.computeVertexNormals();
                        
                        const mesh = new THREE.Mesh(geometry, invisibleMaterial);
                        pivot.add(mesh);
                        
                        // Pieces cracks
                        var computeVertexDistanceToCenter = function(j) {
                            var p = new THREE.Vector3(geometry.attributes.position.array[j * 3], geometry.attributes.position.array[j * 3 + 1],geometry.attributes.position.array[j * 3 + 2]);
                            p.add(pieceDisplacement);
                            var d = p.lengthSq();
                            //if (i == 26) console.log(pieceDisplacement, j, d);
                            return d;
                        };
                        
                        var vertexClosestToCenter = 0;
                        var sqDistance = computeVertexDistanceToCenter(0);
                        
                        for (let x = 1; x < vertexCount; ++x)
                        {
                            var vDistance = computeVertexDistanceToCenter(x);
                            if (vDistance < sqDistance) {
                                vertexClosestToCenter = x;
                                sqDistance = vDistance;
                            }
                        }
                        
                        
                        var prevVertex = (vertexClosestToCenter + vertexCount - 1)%vertexCount;
                        var nextVertex = (vertexClosestToCenter + 1)%vertexCount;
                        //if (i == 26) console.log(prevVertex, vertexClosestToCenter, nextVertex);
                        
                        var crackPositions = [];
                        
                        crackPositions.push(geometry.attributes.position.array[prevVertex * 3]);
                        crackPositions.push(geometry.attributes.position.array[prevVertex * 3 + 1] + OUTLINE_DISPLACEMENT);
                        crackPositions.push(geometry.attributes.position.array[prevVertex * 3 + 2]);
                        
                        crackPositions.push(geometry.attributes.position.array[vertexClosestToCenter * 3]);
                        crackPositions.push(geometry.attributes.position.array[vertexClosestToCenter * 3 + 1] + OUTLINE_DISPLACEMENT);
                        crackPositions.push(geometry.attributes.position.array[vertexClosestToCenter * 3 + 2]);
                        
                        if (sqDistance < 1000) { // hand picked number
                            crackPositions.push(geometry.attributes.position.array[nextVertex * 3]);
                            crackPositions.push(geometry.attributes.position.array[nextVertex * 3 + 1] + OUTLINE_DISPLACEMENT);
                            crackPositions.push(geometry.attributes.position.array[nextVertex * 3 + 2]);
                        }
                        
                        var crackGeom = new THREE.BufferGeometry();
                        crackGeom.setAttribute("position", new THREE.BufferAttribute(new Float32Array(crackPositions), 3));
                        var crackMesh = new THREE.Line(crackGeom, outlineMaterial);
                        pivot.add(crackMesh);
                        
                        // Pieces outlines
                        const outlines = [];
                        var outlinePositions = [];
                        for (let x = 0; x < vertexCount * 3; ++x) // This is set by hand
                        {
                            if (x % 3 == 1) outlinePositions.push(geometry.attributes.position.array[x] + OUTLINE_DISPLACEMENT); // for zfighting
                            else outlinePositions.push(geometry.attributes.position.array[x]);
                        }
                        const outlineGeometry = new THREE.BufferGeometry();
                        outlineGeometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array(outlinePositions), 3) );
                        outlines.push(new THREE.LineLoop(outlineGeometry, outlineMaterial));
                        pivot.add(outlines[0]);
                        
                        // underside outline
                        outlinePositions = [];
                        for (let x = 0; x < vertexCount * 3; ++x) // This is set by hand
                        {
                            if (x % 3 == 1) outlinePositions.push(geometry.attributes.position.array[x + vertexCount * 2 * 3] - OUTLINE_DISPLACEMENT); // for zfighting
                            else outlinePositions.push(geometry.attributes.position.array[x + vertexCount * 2 * 3]);
                        }
                        const outlineGeometryUnder = new THREE.BufferGeometry();
                        outlineGeometryUnder.setAttribute("position", new THREE.BufferAttribute(new Float32Array(outlinePositions), 3) );
                        outlines.push(new THREE.LineLoop(outlineGeometryUnder, outlineMaterial));
                        pivot.add(outlines[1]);
                        
                        
                        
                        var piece = {
                            object3D: pivot,
                            originalPosition: pieceDisplacement,
                            moving: false,
                            rotationAxis: new THREE.Vector3().random().normalize(),
                            rotationSpeed: 0,
                            velocity: new THREE.Vector3(),
                            speed: 0,
                            mesh: mesh,
                            crack: crackMesh,
                            outlines: outlines,
                            staticTime: 0,
                            sortedOrder: 0,
                            showingOutline: false,
                            
                            setMoving: function(m) {
                                this.moving = m;
                                this.outlines[0].visible = m;
                                this.outlines[1].visible = m;
                                this.mesh.material = !m? invisibleMaterial : piecesMaterial;
                            },
                            
                            showOutline: function(m) {
                                this.showingOutline = m;
                                this.crack.visible = m;
                            },
                            
                            init: function () {
                                this.object3D.position.copy(this.originalPosition);
                                this.object3D.quaternion.identity();
                                this.rotationAxis.copy(new THREE.Vector3().random().normalize());
                                
                                
                                this.velocity.copy(this.originalPosition);
                                this.velocity.setY(guiData.piecesVerticalMovementFactor);
                                this.velocity.normalize();
                                
                                var receivedSpeed = easing.easeInCirc(Math.abs(this.velocity.y));
                                
                                this.rotationSpeed = receivedSpeed * (guiData.piecesRotationSpeed + THREE.MathUtils.lerp(-guiData.piecesRotationSpeed * 0.5, guiData.piecesRotationSpeed * 0.5, Math.random()));
                                this.speed = receivedSpeed * (guiData.piecesSpeed + THREE.MathUtils.lerp(-guiData.piecesSpeed * 0.1, guiData.piecesSpeed * 0.1, Math.random()));
                                this.setMoving(false);
                                this.showOutline(false);
                                
                                var insideFactor = this.sortedOrder/(pieces.length - 1);
                                insideFactor = easing.easeInSine(insideFactor);
                                this.staticTime = THREE.MathUtils.lerp(guiData.startBreakingTime, guiData.endBreakingTime, insideFactor) * guiData.totalAnimationTime;
                            }
                        }
                        pieces.push(piece);
                    }
                }
            }
            // sort pieces
            for (let i = 0; i < pieces.length; ++i)
                sortedPieces.push(i);
            
            sortedPieces.sort(function(a, b) {
                return pieces[a].originalPosition.lengthSq() - pieces[b].originalPosition.lengthSq();
            });
            for (let i = 0; i < sortedPieces.length; ++i) {
                pieces[sortedPieces[i]].sortedOrder = i;
                //if (i == 9) console.log(sortedPieces[i]);
            }
                
            for (let i = 0; i < pieces.length; ++i)
                pieces[i].init();
            
            // Wormhole
            const circleSegments = 18;
            numberOfCircles = 10;
            circleRadiusMax = (rocks.boundingBox.max.x - rocks.boundingBox.min.x) * 0.25;
            circleRadiusMin = circleRadiusMax * 0.3;
            distanceBetweenCircles = circleRadiusMax * 0.1;
            var rocksCenter = new THREE.Vector3();
            //rocks.boundingBox.getCenter(rocksCenter);
            
            var allCirclePoints = [];
            for(let i = 0; i < numberOfCircles; ++i)
            {
                const points = [];
                const radius = THREE.MathUtils.lerp(circleRadiusMax, circleRadiusMin, easing.easeOutQuad(i / (numberOfCircles - 1)));
                const depth = (-i - 1) * distanceBetweenCircles;
                for (let j = 0; j < circleSegments + 1; ++j)
                {
                    var angle = j * Math.PI * 2 / circleSegments;
                    points.push(new THREE.Vector3(Math.cos(angle), 0, Math.sin(angle)).add(rocksCenter));
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
                rocks.add(circle);
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
                    if (i == 32 && j == 0) continue; // Arrow
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
}

function createDebugGUI ()
{
    if (gui) gui.destroy();

    gui = new GUI({ width: 350 });

    // GUI

    gui.add(guiData, "spaceshipLogoSize", 0.001, 20).name("Spaceship&Logo Size").onChange(function () { arrow.resizeArrow(guiData.spaceshipLogoSize); });
    gui.add(guiData, "totalAnimationTime", 1, 40).name("Animation Time");
    var cameraGUI = gui.addFolder("Camera");
    cameraGUI.add(guiData, "cameraFOV", 10, 90).name("Field of View").onChange(function () { camera.fov = guiData.cameraFOV; camera.updateProjectionMatrix(); });
    cameraGUI.add(guiData, "cameraDistanceZ", 0.5, 100).name("Z distance").onChange(function () { camera.position.z = guiData.cameraDistanceZ; });
    cameraGUI.add(guiData, "cameraStartY").name("start Y position");
    cameraGUI.add(guiData, "cameraEndY").name("end Y position");
    cameraGUI.add(guiData, "cameraDoTilt").name("tilt camera");
    cameraGUI.add(guiData, "cameraStartLookingAtShipFactor", 0, 1).name("lookAtShipStartAnim %");
    cameraGUI.add(guiData, "cameraStartLookingAtHeight").name("Start lookAt height");
    cameraGUI.add(guiData, "cameraShakeStart").name("Camera shake start % of breaking animation");
    cameraGUI.add(guiData, "cameraShakePitch", 0, 15).name("max shake Pitch");
    cameraGUI.add(guiData, "cameraShakeRoll", 0, 15).name("max shake Roll");
    cameraGUI.add(guiData, "cameraShakeYaw", 0, 15).name("max shake Yaw");
    cameraGUI.add(guiData, "cameraShakeDecay").name("Camera shake decay speed");
    cameraGUI.add(guiData, "cameraShakeSpeed").name("Camera shake frequency");
    var spaceshipGUI = gui.addFolder("Spaceship");
    spaceshipGUI.add(guiData, "spaceshipStartY").name("start Y position");
    spaceshipGUI.add(guiData, "spaceshipEndY").name("end Y position");
    spaceshipGUI.add(guiData, "spaceshipStartMovingFactor", 0, 1).name("startMovingAnim %");
    var holeGUI = gui.addFolder("Wormhole");
    holeGUI.add(guiData, "holeSize", 0, 100).name("Hole Size").onChange(function () {
        rocks.resizeHole(guiData.holeSize);
        //restart();
    });
    holeGUI.add(guiData, "startBreakingTime", 0, 1).name("startBreakAnim %").onChange(restart);
    holeGUI.add(guiData, "endBreakingTime", 0, 1).name("endBreakAnim %").onChange(restart);
    holeGUI.add(guiData, "piecesPostBreakStay").name("Stay-time before explosion");
    holeGUI.add(guiData, "piecesPostBreakAmount").name("Amount of shake before explosion");
    holeGUI.add(guiData, "wormholeRotationSpeed").name("lines rotation speed");
    holeGUI.add(guiData, "wormholeFallingSpeed").name("circles falling speed");
    var rocksGUI = gui.addFolder("Rocks");
    rocksGUI.add(guiData, "piecesSpeed").name("translation speed").onChange(restart);
    rocksGUI.add(guiData, "piecesRotationSpeed", 0, 50).name("rotation speed").onChange(restart);
    rocksGUI.add(guiData, "piecesSpeedFriction", 0, 10).name("translation friction");
    rocksGUI.add(guiData, "piecesRotationFriction", 0, 2).name("rotation friction");
    rocksGUI.add(guiData, "piecesVerticalMovementFactor", 0, 500).name("vertical movement amount").onChange(restart);
    var physicsGUI = gui.addFolder("Physics");
    physicsGUI.add(guiData, "doMoonGravity").name("moon gravity");
    physicsGUI.add(guiData, "moonGravity").name("moon mass");
    physicsGUI.add(guiData, "collideMoon").name("moon collision");
    physicsGUI.add(guiData, "collisionBounciness", 0, 2).name("moon bounciness");
    var logoGUI = gui.addFolder("Logo");
    logoGUI.add(guiData, "logoFadeinStart", 0, 2).name("fadein start %");
    logoGUI.add(guiData, "logoFadeinEnd", 0, 2).name("fadein start %");
    var moonGUI = gui.addFolder("Moon");
    moonGUI.add(guiData, "moonSize", 0, 50).name("size").onChange(function() {
        moon.scale.set(guiData.moonSize, guiData.moonSize, guiData.moonSize);
    });
    moonGUI.add(guiData, "moonRPM", -10, 10).name("rotations/minute");
    moonGUI.add(guiData, "moonPositionY").name("Y position end");
    moonGUI.add(guiData, "moonStartPositionY").name("Y position start")
    moonGUI.add(guiData, "moonPositionZ").name("Z position");
    var lineTrailGUI = gui.addFolder("Line Trail");
    lineTrailGUI.add(guiData, "lineTrailWidth", 0, 1).name("width");
    lineTrailGUI.add(guiData, "lineTrailAttachmentHeight", -10, 0).name("attached pos Y");
    lineTrailGUI.add(guiData, "lineTrailEndFactor", 0, 1).name("end animation %");
    lineTrailGUI.add(guiData, "lineTrailLengthStart", -500, 0).name("length start");
    lineTrailGUI.add(guiData, "lineTrailLengthEnd", -500, 0).name("length end");
    lineTrailGUI.add(guiData, "lineTrailRandomFactor", 0, 1).name("flicker width %");
    var trailGUI = gui.addFolder("OLD Trail");
    trailGUI.add(guiData, "trailWidth", 0, 10).name("max width");
    trailGUI.add(guiData, "trailRandomFactor", 0, 1).name("flicker width %");
    trailGUI.add(guiData, "trailLengthStart", 0, 100).name("length start");
    trailGUI.add(guiData, "trailLengthEnd", 0, 300).name("length end");
    trailGUI.add(guiData, "trailEndFactor", 0, 1).name("end animation %");
    
    
    var debugGUI = gui.addFolder("DEBUG");
    debugGUI.add(guiData, "DEBUG_RESIZABLE_WINDOW").name("Resizable Window");
    debugGUI.add(guiData, "DEBUG_PLANE").name("Show debug plane").onChange(function () {
        if (guiData.DEBUG_PLANE)
            scene.add(DEBUG_plane);
        else scene.remove(DEBUG_plane);
    });
    
    gui.closed = true;

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
        piecesMaterial.uniforms.screenRatio.value = width / height;
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
    if (guiData.DEBUG_RESIZABLE_WINDOW && resizeRendererToDisplaySize(renderer)) {
        //console.log("canvas resized to ", window.innerWidth, window.innerHeight);
    }

    renderer.render(scene, camera);
}

function update(deltaTime) {
    animationTime += deltaTime;

    const unclampedAnimationFactor = animationTime / guiData.totalAnimationTime;
    const animationFactor = Math.max(0, Math.min(1, unclampedAnimationFactor));

    camera.position.x = 0;
    camera.position.z = guiData.cameraDistanceZ;

    if (animationFactor < guiData.spaceshipStartMovingFactor) {
        arrow.position.y = guiData.spaceshipStartY;
        camera.position.y = guiData.cameraStartY;
        
        trail.visible = true;
        trail.scale.set(guiData.trailWidth, guiData.trailLengthStart, 1);
        lineTrail.visible = true;
        moon.position.y = guiData.moonStartPositionY;
    }
    else {
        var f = (animationFactor - guiData.spaceshipStartMovingFactor)/(1 - guiData.spaceshipStartMovingFactor);
        arrow.position.y = THREE.MathUtils.lerp(guiData.spaceshipStartY, guiData.spaceshipEndY, easing.easeOutCubic(f));
        camera.position.y = THREE.MathUtils.lerp(guiData.cameraStartY, guiData.cameraEndY, easing.easeInOutSine(f));
        moon.position.y = THREE.MathUtils.lerp(guiData.moonStartPositionY, guiData.moonPositionY, easing.easeOutCubic(f));
        
        var trailF = (animationFactor - guiData.spaceshipStartMovingFactor)/(guiData.trailEndFactor - guiData.spaceshipStartMovingFactor);
        if (trailF < 1) {
            trail.visible = true;
            let trailFixedFactor = 1 - guiData.trailRandomFactor;
            trail.scale.set(Math.random() * guiData.trailWidth * guiData.trailRandomFactor + guiData.trailWidth * trailFixedFactor, THREE.MathUtils.lerp(guiData.trailLengthStart, guiData.trailLengthEnd, easing.easeInCubic(trailF)), 1);
        }
        else {
            trail.visible = false;
        }
        
        var lineF = (animationFactor - guiData.spaceshipStartMovingFactor)/(guiData.lineTrailEndFactor - guiData.spaceshipStartMovingFactor);
        if (lineF < 1) {
            lineTrail.visible = true;
            
            lineTrailStart = THREE.Math.lerp(guiData.lineTrailLengthStart, guiData.lineTrailLengthEnd, easing.easeOutCubic(lineF));
            lineTrailEnd = 0;
            
            lineTrail.update(lineTrailStart, lineTrailEnd);
        }
        else {
            lineTrail.visible = false;
        }
    }
    
    if (guiData.cameraDoTilt) {
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
    }
    else {
        camera.quaternion.identity();
    }

    // Shaking
    let END_BREAKING_TIME = guiData.endBreakingTime * guiData.totalAnimationTime;
    let shakeStartTime = guiData.cameraShakeStart * END_BREAKING_TIME;
    if (shakeStartTime <= animationTime && animationTime < END_BREAKING_TIME)
    {
        cameraShakeIntensity = (animationTime - shakeStartTime) / (END_BREAKING_TIME - shakeStartTime);
        cameraShakeIntensity = easing.easeInCubic(cameraShakeIntensity);
    }
    else {
        cameraShakeIntensity = Math.max(0, cameraShakeIntensity - guiData.cameraShakeDecay * deltaTime);
    }

    if (cameraShakeIntensity > 0)
    {
        let eulerAngles = new THREE.Euler();
        let intensity_sq = cameraShakeIntensity * cameraShakeIntensity;
        let t = animationTime * guiData.cameraShakeSpeed;
        
        //eulerAngles.x = intensity_sq * guiData.cameraShakePitch * 0.0174533 * (Math.sin(t) + Math.sin(t * 3) * 0.5); // deg to rad = 0.0174533
        //eulerAngles.y = intensity_sq * guiData.cameraShakeYaw * 0.0174533 * (Math.cos(t) + Math.sin(t * 4) * 0.5);
        //eulerAngles.z = intensity_sq * guiData.cameraShakeRoll * 0.0174533 * Math.sin(t *0.5 + 2);

        eulerAngles.x = intensity_sq * guiData.cameraShakePitch * 0.0174533 * 2 * (noise.simplex2(cameraShakeSeed, t) - 0.5); // deg to rad = 0.0174533
        eulerAngles.y = intensity_sq * guiData.cameraShakeYaw * 0.0174533 * 2 * (noise.simplex2(cameraShakeSeed + 1, t) - 0.5);
        eulerAngles.z = intensity_sq * guiData.cameraShakeRoll * 0.0174533 * 2 * (noise.simplex2(cameraShakeSeed + 2, t) - 0.5);

        camera.quaternion.setFromEuler(eulerAngles);
    }
    else {
        camera.quaternion.identity();
    }

    
    //
    arrow.quaternion.copy(camera.quaternion);
    
    var visiblePieces = 0;
    var movingPieces = 0;
    var moonPositionRocks = new THREE.Vector3().copy(moon.position).divideScalar(rocks.scale.x);
    var moonRadius = guiData.moonSize / rocks.scale.x;
    for (let i = 0; i < pieces.length; ++i)
    {
        const p = pieces[i];
        if (p.moving)
        {
            movingPieces++;

            if (p.staticTime > 0) {
                p.staticTime -= deltaTime;
                let progress = Math.min(1, Math.max(0, (guiData.piecesPostBreakStay - p.staticTime) / guiData.piecesPostBreakAmount));
                
                p.object3D.position.copy(p.originalPosition);
                var translation = new THREE.Vector3().copy(p.velocity).multiplyScalar(p.speed * progress * guiData.piecesPostBreakAmount);
                p.object3D.position.add(translation);
                p.object3D.quaternion.copy(new THREE.Quaternion().setFromAxisAngle(p.rotationAxis, p.rotationSpeed * progress * guiData.piecesPostBreakAmount));

                continue;
            }

            p.speed = moveTowards(p.speed, 0, deltaTime * guiData.piecesSpeedFriction);
            p.rotationSpeed = moveTowards(p.rotationSpeed, 0, deltaTime * guiData.piecesRotationFriction);
            
            // gravity
            if (guiData.doMoonGravity)
            {
                var instantVel = p.velocity.clone();
                instantVel.multiplyScalar(p.speed);
                
                var moonDeltaPos = new THREE.Vector3().copy(moonPositionRocks).sub(p.object3D.position);
                var distanceToMoonSq = moonDeltaPos.lengthSq();
                var gravityAcc = new THREE.Vector3().copy(moonDeltaPos);
                gravityAcc.normalize();
                var gravityForce = guiData.moonGravity / distanceToMoonSq;
                gravityAcc.multiplyScalar(gravityForce * deltaTime);
                    
                instantVel.add(gravityAcc);
                
                p.speed = instantVel.length();
                instantVel.normalize();
                p.velocity.copy(instantVel);
            }
            
            var translation = new THREE.Vector3().copy(p.velocity).multiplyScalar(p.speed * deltaTime);
            
            p.object3D.position.add(translation);
            
            if (p.velocity.z > 0 && p.object3D.position.z * rocks.scale.z > camera.position.z - 2)
            {
                p.velocity.setZ(-Math.abs(p.velocity.z));
                //console.log(i);
                if (!rockCrashed && i == 17) { // 17 is the one hitting the camera
                    cameraShakeIntensity = 0.5;
                    rockCrashed = true;
                }
            }
            
            if (guiData.collideMoon)
            {
                moonDeltaPos = new THREE.Vector3().copy(p.object3D.position).sub(moonPositionRocks);
                var distanceToMoon = moonDeltaPos.length();
                if (distanceToMoon < moonRadius)
                {
                    var correction = moonDeltaPos.clone().normalize();
                    correction.multiplyScalar(moonRadius);
                    p.object3D.position.copy(moonPositionRocks).add(correction);
                    
                    moonDeltaPos.normalize();
                    p.velocity.reflect(moonDeltaPos);
                    p.rotationSpeed = p.speed * 0.01;
                    p.speed *= guiData.collisionBounciness;
                }
            }
            
            translation.copy(p.object3D.position)
            p.object3D.applyQuaternion(new THREE.Quaternion().setFromAxisAngle(p.rotationAxis, p.rotationSpeed * deltaTime));
                
            //if (i == 0) console.log(p.object3D.quaternion);
        }
        else if (!p.showingOutline) {
            p.staticTime -= deltaTime;
            if (p.staticTime < 0) {
                p.showOutline(true);
            }
        }
        else visiblePieces++;
    }
    
    var allPiecesOutlined = visiblePieces == pieces.length;
    if (allPiecesOutlined)
    {
        for (let i = 0; i < pieces.length; ++i)
        {
            let p = pieces[i];
            p.staticTime = guiData.piecesPostBreakStay;
            p.setMoving(true);
        }
    }
    holeOutlineMesh.visible = allPiecesOutlined || movingPieces == pieces.length;
    
    // logo
    if (animationFactor < guiData.logoFadeinStart) {
        setLogoTransparency(0);
    }
    else if (animationFactor < guiData.logoFadeinEnd) {
        setLogoTransparency(easing.easeInQuad((unclampedAnimationFactor - guiData.logoFadeinStart)/(guiData.logoFadeinEnd - guiData.logoFadeinStart)));
    }
    else {
        setLogoTransparency(1);
    }
    
    //moon
    moon.position.z = guiData.moonPositionZ;
    //var moonRotation = new THREE.Quaternion().setFromAxisAngle(new THREE.)
    var moonRotationAxis = new THREE.Vector3(0,1,1);
    moonRotationAxis.normalize();
    moon.quaternion.setFromAxisAngle(moonRotationAxis, animationTime * guiData.moonRPM / 60 * Math.PI * 2);
    
    // Wormhole lines
    var wormholeAxis = new THREE.Vector3(0,1,0);
    for (let i = 0; i < wormholeLines.length; ++i) {
        var r = animationTime * (i + 1)/wormholeLines.length * Math.PI * guiData.wormholeRotationSpeed;
        if (i % 2 == 0) r = -r;
        wormholeLines[i].quaternion.setFromAxisAngle(wormholeAxis, r);
    }

    // Wormhole circles
    let holeDepth = animationTime * guiData.wormholeFallingSpeed;
    let holeFactor = holeDepth / distanceBetweenCircles;
    holeFactor = holeFactor - Math.floor(holeFactor);
    //console.log(holeDepth + " / "+distanceBetweenCircles, holeFactor);

    for (let i = 0; i < wormholeCircles.length; ++i)
    {
        const depth = (-i - 1 - holeFactor) * distanceBetweenCircles;
        const radius = THREE.MathUtils.lerp(circleRadiusMax, circleRadiusMin, easing.easeOutQuad((i + holeFactor) / (numberOfCircles - 1)));
        wormholeCircles[i].scale.set(radius,radius,radius);
        wormholeCircles[i].position.setY(depth);
    }
    
    // linetrail
    lineTrail.update(lineTrailStart, lineTrailEnd);
}

function restart() {
    animationTime = 0;
    
    for (let i = 0; i < pieces.length; ++i)
    {
        pieces[i].init();
    }
    
    arrow.position.y = guiData.spaceshipStartY;
    
    logoPivot.position.y = guiData.spaceshipEndY + 0.12;
    rockCrashed = false;
}

canvas.addEventListener("mousedown", restart);