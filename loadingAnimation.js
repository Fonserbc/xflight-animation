"use strict";

import * as THREE from './lib/three.js';
import { SVGLoader } from "./lib/SVGLoader.js";
import { GLTFLoader } from "./lib/GLTFLoader.js";
import { GUI } from "./lib/dat.gui.js";
import Stats from "./lib/stats.js";
import easing from "./lib/easings.js";
import noise from "./lib/perlin.js";

let canvas, stats, camera, scene, renderer, gui, variables = {};
let filesWaitingToLoad = 0;

let cameraPivot;
let logoPivot, logoGroup, logoMaterials = [];

let holeGroup;
let stars;
let wormholeLines = [], wormholeCircles = [], distanceBetweenCircles, circleRadiusMax, circleRadiusMin, numberOfCircles;

// Models
let sphereModel, triplanarModel, orbitModel;

let starsMaterial;

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

    camera = new THREE.PerspectiveCamera(variables.cameraFOV, window.innerWidth / window.innerHeight, 1, 1000);
    camera.position.z = variables.cameraDistanceZ;
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
    logoPivot.position.z = variables.logoPosZ;
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
        group.position.y = logoSideSize + 1.2 * scale;//variables.spaceshipEndY
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
    sphereModel = new THREE.Group();
    triplanarModel = new THREE.Group();
    orbitModel = new THREE.Group();
    scene.add(sphereModel);
    scene.add(triplanarModel);
    scene.add(orbitModel);

    gltfLoader.load("res/3d/sphere.glb",function (gltf) {
        sphereModel.add(gltf.scene);
    });
    
    gltfLoader.load("res/3d/orbit.glb",function (gltf) {
        orbitModel.add(gltf.scene);
    });
    
    gltfLoader.load("res/3d/triplanar.glb",function (gltf) {
        triplanarModel.add(gltf.scene);
    });

    // Starfield
    initStars(variables.starCount);
}

function initStars(particleCount)
{
    const positions = new Float32Array( particleCount * 3 );
	const scales = new Float32Array( particleCount );

    for ( let i = 0; i < particleCount; i ++ ) {

		const x = Math.random() - 0.5;
		const y = Math.random() - 0.5 ;
		const z = Math.random();

		positions[i*3] = x;
		positions[i*3 + 1] = y;
		positions[i*3 + 2] = z;

        scales[i] = Math.random();
	}

    const geometry = new THREE.BufferGeometry();
	geometry.setAttribute( 'position', new THREE.BufferAttribute( positions, 3 ) );
	geometry.setAttribute( 'scale', new THREE.BufferAttribute( scales, 1 ) );

	starsMaterial = new THREE.ShaderMaterial( {
		uniforms: {
            time: { value: 0 },
			color: { value: new THREE.Color( 0xffffff ) },
            minSize: { value: variables.starsMinSize },
            maxSize: { value: variables.starsMaxSize },
            speed: { value: variables.starsSpeed },
            distanceFalloff: { value: variables.starsFalloff }
		},
		vertexShader: document.getElementById( 'vertexStars' ).textContent,
		fragmentShader: document.getElementById( 'fragmentStars' ).textContent

	} );

	//

    if (stars != null) {
        scene.remove(stars);
    }
	stars = new THREE.Points( geometry, starsMaterial );
    stars.position.z = 10;
	scene.add( stars );
}


function createDebugGUI ()
{
    if (gui) gui.destroy();

    gui = new GUI({ width: 350 });

    // GUI
    
    var logoGUI = gui.addFolder("Logo");
    variables["logoSize"] = 1;
    logoGUI.add(variables, "logoSize", 0.001, 20).name("Logo Size")
    .onChange(function () {
        logoGroup.scale.set(variables.logoSize, variables.logoSize, variables.logoSize);
    });
    variables["logoPosZ"] = -10;
    logoGUI.add(variables, "logoPosZ").name("Logo Position Z");
    variables["logoAlpha"] = 1;
    logoGUI.add(variables, "logoAlpha", 0, 1).name("Logo Transparency")
    .onChange(function () {
        setLogoTransparency(variables.logoAlpha);
    });

    var cameraGUI = gui.addFolder("Camera");
    variables["cameraDistanceZ"] = 10;
    cameraGUI.add(variables, "cameraDistanceZ", 0, 50).name("Z distance");
    variables["cameraFOV"] = 55;
    cameraGUI.add(variables, "cameraFOV", 10, 90).name("Field of View")
    .onChange(function () {
        camera.fov = variables.cameraFOV; camera.updateProjectionMatrix();
    });
    variables["cameraRotationAngle"] = 20;
    cameraGUI.add(variables, "cameraRotationAngle", 2, 179).name("Mouse rotation max angle");
    
    var holeGUI = gui.addFolder("Wormhole");
    variables["holeSize"] = 10;
    holeGUI.add(variables, "holeSize", 0, 100).name("size").onChange(function () {
        holeGroup.scale.set(variables.holeSize, variables.holeSize, variables.holeSize);
    });
    variables["wormholeRotationSpeed"] = 0;
    holeGUI.add(variables, "wormholeRotationSpeed").name("lines rotation speed");
    variables["wormholeFallingSpeed"] = 0.5;
    holeGUI.add(variables, "wormholeFallingSpeed", 0, 3).name("circles falling speed");

    
    var starsGUI = gui.addFolder("Stars");
    variables["starColor"] = 0xffffff;
    starsGUI.addColor(variables, "starColor").onChange(function() {
        starsMaterial.uniforms.color.value.set(variables.starColor);
    });
    variables["starCount"] = 2048;
    starsGUI.add(variables, "starCount");
    variables["regenerateStars"] = function() {
        initStars(variables["starCount"]);
    };
    starsGUI.add(variables, "regenerateStars").name("regenerate stars");
    variables["starsDepth"] = 200;
    starsGUI.add(variables, "starsDepth", 1, 1000);
    variables["starsWidth"] = 50;
    starsGUI.add(variables, "starsWidth", 0, 100);
    variables["starsSpeed"] = 0.02;
    starsGUI.add(variables, "starsSpeed", 0, 2);
    variables["starsMinSize"] = 0.1;
    starsGUI.add(variables, "starsMinSize", 0, 100);
    variables["starsMaxSize"] = 1;
    starsGUI.add(variables, "starsMaxSize", 0, 100);

    
    
    var modelsGUI = gui.addFolder("Models");
    variables["spherePos"] = new THREE.Vector3();
    let spherePosGUI = modelsGUI.addFolder("sphere position");
    spherePosGUI.add(variables.spherePos, "x", -10, 10);
    spherePosGUI.add(variables.spherePos, "y", -10, 10);
    spherePosGUI.add(variables.spherePos, "z", -10, 10);
    
    variables["triplanarPos"] = new THREE.Vector3(-3,0,0);
    let triplanarPosGUI = modelsGUI.addFolder("triplanar position");
    triplanarPosGUI.add(variables.triplanarPos, "x", -10, 10);
    triplanarPosGUI.add(variables.triplanarPos, "y", -10, 10);
    triplanarPosGUI.add(variables.triplanarPos, "z", -10, 10);
    
    variables["orbitPos"] = new THREE.Vector3(3,0,0);
    let orbitPosGUI = modelsGUI.addFolder("orbit position");
    orbitPosGUI.add(variables.orbitPos, "x", -10, 10);
    orbitPosGUI.add(variables.orbitPos, "y", -10, 10);
    orbitPosGUI.add(variables.orbitPos, "z", -10, 10);

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
    camera.position.z = variables.cameraDistanceZ;

    cameraPivot.quaternion.setFromEuler(new THREE.Euler(
        THREE.MathUtils.degToRad(mouseNormalizedPos.y * variables.cameraRotationAngle),
        THREE.MathUtils.degToRad(mouseNormalizedPos.x * variables.cameraRotationAngle),
        0));

    // Shaking

    if (cameraShakeIntensity > 0)
    {
        let eulerAngles = new THREE.Euler();
        let intensity_sq = cameraShakeIntensity * cameraShakeIntensity;
        let t = time * variables.cameraShakeSpeed;

        eulerAngles.x = intensity_sq * variables.cameraShakePitch * 0.0174533 * 2 * (noise.simplex2(cameraShakeSeed, t) - 0.5); // deg to rad = 0.0174533
        eulerAngles.y = intensity_sq * variables.cameraShakeYaw * 0.0174533 * 2 * (noise.simplex2(cameraShakeSeed + 1, t) - 0.5);
        eulerAngles.z = intensity_sq * variables.cameraShakeRoll * 0.0174533 * 2 * (noise.simplex2(cameraShakeSeed + 2, t) - 0.5);

        camera.quaternion.setFromEuler(eulerAngles);
    }
    else {
        camera.quaternion.identity();
    }
    
    logoPivot.position.z = variables.logoPosZ;
    
    // Wormhole lines
    var wormholeAxis = new THREE.Vector3(0,1,0);
    for (let i = 0; i < wormholeLines.length; ++i) {
        var r = time * (i + 1)/wormholeLines.length * Math.PI * variables.wormholeRotationSpeed;
        if (i % 2 == 0) r = -r;
        wormholeLines[i].quaternion.setFromAxisAngle(wormholeAxis, r);
    }

    // Wormhole circles
    let holeDepth = time * variables.wormholeFallingSpeed;
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
    sphereModel.position.copy(variables.spherePos);
    triplanarModel.position.copy(variables.triplanarPos);
    orbitModel.position.copy(variables.orbitPos);

    //
    starsMaterial.uniforms.time.value = time;
    starsMaterial.uniforms.minSize.value = variables.starsMinSize;
    starsMaterial.uniforms.maxSize.value = variables.starsMaxSize;
    starsMaterial.uniforms.speed.value = variables.starsSpeed;

    stars.scale.set(variables.starsWidth, variables.starsWidth, variables.starsDepth);
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