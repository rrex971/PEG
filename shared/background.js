/* PEG Shared Background Animation Component */

class PEGBackground {
    constructor(containerId = 'peg-bg-scene') {
        this.container = document.getElementById(containerId);
        if (!this.container) {
            console.error(`Container with id "${containerId}" not found`);
            return;
        }
        
        this.boxes = Array.from(this.container.querySelectorAll('.peg-float-box')).map((element, index) => ({
            element,
            speed: Number(element.dataset.speed) || 0.2,
            phase: Number(element.dataset.phase) || index,
            ampY: Number(element.dataset.ay) || 14,
            flipped: element.classList.contains('peg-box-two') || 
                     element.classList.contains('peg-box-four') || 
                     element.classList.contains('peg-box-six')
        }));
        
        this.prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        this.animationId = null;
        this.init();
    }
    
    init() {
        if (!this.prefersReducedMotion) {
            this.startAnimation();
        }
        
        // Handle reduced motion preference changes
        window.matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change', (e) => {
            this.prefersReducedMotion = e.matches;
            if (this.prefersReducedMotion) {
                this.stopAnimation();
            } else {
                this.startAnimation();
            }
        });
    }
    
    animate(timestamp) {
        const time = timestamp / 1000;
        
        this.boxes.forEach((box) => {
            // Only move on Y-axis
            const y = Math.cos((time * (box.speed * 0.92)) + box.phase) * box.ampY;
            
            // Apply transform - only Y translation
            box.element.style.transform = `translateY(${y}px)${box.flipped ? ' scaleX(-1)' : ''}`;
        });
        
        this.animationId = requestAnimationFrame(this.animate.bind(this));
    }
    
    startAnimation() {
        if (!this.animationId) {
            this.animationId = requestAnimationFrame(this.animate.bind(this));
        }
    }
    
    stopAnimation() {
        if (this.animationId) {
            cancelAnimationFrame(this.animationId);
            this.animationId = null;
            
            // Reset positions
            this.boxes.forEach((box) => {
                box.element.style.transform = box.flipped ? 'scaleX(-1)' : '';
            });
        }
    }
    
    destroy() {
        this.stopAnimation();
        this.boxes = [];
    }
}

// Auto-initialize if script is loaded in page with default container
if (document.getElementById('peg-bg-scene')) {
    window.pegBackground = new PEGBackground();
}

// Export for module usage
if (typeof module !== 'undefined' && module.exports) {
    module.exports = PEGBackground;
}