/**
 * Hero 3D Floating Particles Effect
 * Creates an ethereal memorial atmosphere with glowing particles
 */

(function() {
    'use strict';

    // Configuration
    const CONFIG = {
        particleCount: 80,
        particleSize: { min: 0.02, max: 0.08 },
        particleSpeed: { min: 0.002, max: 0.008 },
        colors: [
            0xd4af37, // Gold (accent color)
            0xffffff, // White
            0xf0c929, // Light gold
            0xffd700, // Golden
            0xffeaa7  // Soft gold
        ],
        fadeInDuration: 2000,
        mouseInfluence: 0.0003
    };

    let scene, camera, renderer, particles;
    let animationId = null;
    let heroSection = null;
    let canvas = null;
    let mouseX = 0, mouseY = 0;
    let isInitialized = false;
    let isVisible = true;

    // Initialize the 3D scene
    function init() {
        heroSection = document.querySelector('.hero');
        if (!heroSection) {
            console.warn('Hero section not found for 3D effect');
            return;
        }

        // Check if Three.js is available
        if (typeof THREE === 'undefined') {
            console.warn('Three.js not loaded');
            return;
        }

        // Create canvas
        canvas = document.createElement('canvas');
        canvas.className = 'hero-3d-canvas';
        canvas.style.cssText = `
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            pointer-events: none;
            z-index: 2;
            opacity: 0;
            transition: opacity ${CONFIG.fadeInDuration}ms ease-out;
        `;
        heroSection.style.position = 'relative';
        heroSection.appendChild(canvas);

        // Scene setup
        scene = new THREE.Scene();

        // Camera setup
        const aspect = heroSection.offsetWidth / heroSection.offsetHeight;
        camera = new THREE.PerspectiveCamera(75, aspect, 0.1, 1000);
        camera.position.z = 2;

        // Renderer setup
        renderer = new THREE.WebGLRenderer({
            canvas: canvas,
            alpha: true,
            antialias: true
        });
        renderer.setSize(heroSection.offsetWidth, heroSection.offsetHeight);
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

        // Create particles
        createParticles();

        // Event listeners
        window.addEventListener('resize', handleResize);
        document.addEventListener('mousemove', handleMouseMove);

        // Visibility API for performance
        document.addEventListener('visibilitychange', handleVisibilityChange);

        // Start animation
        animate();

        // Fade in effect
        requestAnimationFrame(() => {
            canvas.style.opacity = '1';
        });

        isInitialized = true;
        console.log('✨ Hero 3D particles initialized');
    }

    // Create floating particles
    function createParticles() {
        const geometry = new THREE.BufferGeometry();
        const positions = [];
        const colors = [];
        const sizes = [];
        const speeds = [];
        const phases = [];

        for (let i = 0; i < CONFIG.particleCount; i++) {
            // Random position in a wider area
            positions.push(
                (Math.random() - 0.5) * 6,  // x
                (Math.random() - 0.5) * 4,  // y
                (Math.random() - 0.5) * 3   // z
            );

            // Random color from palette
            const color = new THREE.Color(CONFIG.colors[Math.floor(Math.random() * CONFIG.colors.length)]);
            colors.push(color.r, color.g, color.b);

            // Random size
            sizes.push(CONFIG.particleSize.min + Math.random() * (CONFIG.particleSize.max - CONFIG.particleSize.min));

            // Random speed for each particle
            speeds.push(CONFIG.particleSpeed.min + Math.random() * (CONFIG.particleSpeed.max - CONFIG.particleSpeed.min));

            // Random phase for varied movement
            phases.push(Math.random() * Math.PI * 2);
        }

        geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
        geometry.setAttribute('size', new THREE.Float32BufferAttribute(sizes, 1));

        // Store speeds and phases for animation
        geometry.userData = { speeds, phases };

        // Custom shader material for glowing particles
        const material = new THREE.ShaderMaterial({
            uniforms: {
                time: { value: 0 },
                pixelRatio: { value: renderer.getPixelRatio() }
            },
            vertexShader: `
                attribute float size;
                varying vec3 vColor;
                uniform float time;
                uniform float pixelRatio;
                
                void main() {
                    vColor = color;
                    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
                    gl_PointSize = size * pixelRatio * (300.0 / -mvPosition.z);
                    gl_Position = projectionMatrix * mvPosition;
                }
            `,
            fragmentShader: `
                varying vec3 vColor;
                
                void main() {
                    // Create soft circular glow
                    float dist = distance(gl_PointCoord, vec2(0.5));
                    if (dist > 0.5) discard;
                    
                    float alpha = 1.0 - smoothstep(0.0, 0.5, dist);
                    alpha = pow(alpha, 1.5); // Softer falloff
                    
                    // Add glow effect
                    vec3 glowColor = vColor + vec3(0.2);
                    gl_FragColor = vec4(glowColor, alpha * 0.7);
                }
            `,
            transparent: true,
            vertexColors: true,
            blending: THREE.AdditiveBlending,
            depthWrite: false
        });

        particles = new THREE.Points(geometry, material);
        scene.add(particles);
    }

    // Animation loop
    function animate() {
        if (!isVisible) {
            animationId = requestAnimationFrame(animate);
            return;
        }

        const time = performance.now() * 0.001;
        const positions = particles.geometry.attributes.position.array;
        const { speeds, phases } = particles.geometry.userData;

        // Update particle positions
        for (let i = 0; i < CONFIG.particleCount; i++) {
            const i3 = i * 3;
            const speed = speeds[i];
            const phase = phases[i];

            // Gentle floating motion
            positions[i3] += Math.sin(time * 0.5 + phase) * speed * 0.3;     // x
            positions[i3 + 1] += speed + Math.sin(time + phase) * speed * 0.2; // y (rising)
            positions[i3 + 2] += Math.cos(time * 0.3 + phase) * speed * 0.2;   // z

            // Mouse influence
            positions[i3] += mouseX * CONFIG.mouseInfluence;
            positions[i3 + 1] += mouseY * CONFIG.mouseInfluence * 0.5;

            // Reset particles that go too high
            if (positions[i3 + 1] > 2.5) {
                positions[i3 + 1] = -2.5;
                positions[i3] = (Math.random() - 0.5) * 6;
                positions[i3 + 2] = (Math.random() - 0.5) * 3;
            }

            // Keep particles within bounds
            if (Math.abs(positions[i3]) > 3.5) {
                positions[i3] *= 0.95;
            }
        }

        particles.geometry.attributes.position.needsUpdate = true;

        // Update time uniform for potential shader effects
        particles.material.uniforms.time.value = time;

        // Slight camera movement based on mouse
        camera.position.x += (mouseX * 0.00005 - camera.position.x) * 0.02;
        camera.position.y += (mouseY * 0.00005 - camera.position.y) * 0.02;
        camera.lookAt(scene.position);

        renderer.render(scene, camera);
        animationId = requestAnimationFrame(animate);
    }

    // Handle window resize
    function handleResize() {
        if (!heroSection || !renderer || !camera) return;

        const width = heroSection.offsetWidth;
        const height = heroSection.offsetHeight;

        camera.aspect = width / height;
        camera.updateProjectionMatrix();

        renderer.setSize(width, height);
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

        if (particles) {
            particles.material.uniforms.pixelRatio.value = renderer.getPixelRatio();
        }
    }

    // Handle mouse movement
    function handleMouseMove(event) {
        mouseX = (event.clientX - window.innerWidth / 2);
        mouseY = (event.clientY - window.innerHeight / 2);
    }

    // Handle visibility change for performance
    function handleVisibilityChange() {
        isVisible = !document.hidden;
    }

    // Cleanup function
    function destroy() {
        if (animationId) {
            cancelAnimationFrame(animationId);
        }
        
        window.removeEventListener('resize', handleResize);
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('visibilitychange', handleVisibilityChange);

        if (particles) {
            particles.geometry.dispose();
            particles.material.dispose();
        }

        if (renderer) {
            renderer.dispose();
        }

        if (canvas && canvas.parentNode) {
            canvas.parentNode.removeChild(canvas);
        }

        isInitialized = false;
    }

    // Initialize when DOM is ready
    function initWhenReady() {
        // Wait for Three.js to load
        if (typeof THREE === 'undefined') {
            // Check again in 100ms
            setTimeout(initWhenReady, 100);
            return;
        }
        init();
    }

    // Auto-initialize
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initWhenReady);
    } else {
        initWhenReady();
    }

    // Expose for debugging/cleanup
    window.Hero3D = {
        init: init,
        destroy: destroy,
        isInitialized: () => isInitialized
    };
})();
