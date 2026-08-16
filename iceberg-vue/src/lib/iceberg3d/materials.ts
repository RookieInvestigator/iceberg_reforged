import * as THREE from 'three'

/**
 * 词条碎片材质：Lambert 塑形 + 克制的 Fresnel 边缘层次 + 场景雾。
 * 自定义 Shader 必须显式应用 instanceMatrix，并通过 varying 将 instanceColor
 * 从顶点阶段传入片元阶段，否则所有实例会叠在原点或无法通过 Shader 编译。
 */
export function createGemMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    // fog:true 时 WebGLRenderer 会主动更新 fogColor/fogDensity，必须合并内置雾 uniforms。
    uniforms: THREE.UniformsUtils.merge([
      THREE.UniformsLib.fog,
      {
        uAmbient: { value: new THREE.Color(0x0a1525).multiplyScalar(0.9) },
        uLightDir0: { value: new THREE.Vector3(10, 20, 10).normalize() },
        uLightColor0: { value: new THREE.Color(0xffffff).multiplyScalar(1.25) },
        uLightDir1: { value: new THREE.Vector3(-15, 5, -20).normalize() },
        uLightColor1: { value: new THREE.Color(0x1b6f9f).multiplyScalar(0.65) },
        uRimColor: { value: new THREE.Color(0x8eb9d2) },
        uFresnelPower: { value: 3.4 },
        uFresnelStrength: { value: 0.2 },
        uCoreGlow: { value: 0.025 },
      },
    ]),
    vertexShader: /* glsl */ `
      varying vec3 vNormal;
      varying vec3 vWorldPos;
      varying vec3 vInstanceColor;
      #include <fog_pars_vertex>

      void main() {
        vec3 transformed = position;
        vec3 objectNormal = normal;
        vInstanceColor = vec3(1.0);

        #ifdef USE_INSTANCING
          transformed = (instanceMatrix * vec4(position, 1.0)).xyz;
          // 实例采用非均匀缩放；用 three 内置 instancing 法线修正方式保留正确明暗面。
          mat3 instanceMat = mat3(instanceMatrix);
          objectNormal /= vec3(
            dot(instanceMat[0], instanceMat[0]),
            dot(instanceMat[1], instanceMat[1]),
            dot(instanceMat[2], instanceMat[2])
          );
          objectNormal = instanceMat * objectNormal;
        #endif

        #ifdef USE_INSTANCING_COLOR
          vInstanceColor = instanceColor;
        #endif

        vec4 worldPos = modelMatrix * vec4(transformed, 1.0);
        vWorldPos = worldPos.xyz;
        vNormal = normalize(mat3(modelMatrix) * objectNormal);
        vec4 mvPosition = viewMatrix * worldPos;
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uAmbient;
      uniform vec3 uLightDir0;
      uniform vec3 uLightColor0;
      uniform vec3 uLightDir1;
      uniform vec3 uLightColor1;
      uniform vec3 uRimColor;
      uniform float uFresnelPower;
      uniform float uFresnelStrength;
      uniform float uCoreGlow;
      varying vec3 vNormal;
      varying vec3 vWorldPos;
      varying vec3 vInstanceColor;
      #include <fog_pars_fragment>

      void main() {
        // Hover / Focus 实例的颜色分量会编码为「原色 + 2」；普通实例始终处于 0–1。
        // 这样不增加额外 attribute，也能让单个实例切换到整面高饱和着色分支。
        float hoverMask = step(1.5, max(vInstanceColor.r, max(vInstanceColor.g, vInstanceColor.b)));
        vec3 baseColor = mix(vInstanceColor, clamp(vInstanceColor - vec3(2.0), 0.0, 1.0), hoverMask);

        vec3 N = normalize(vNormal);
        vec3 V = normalize(cameraPosition - vWorldPos);
        float keyLight = max(dot(N, uLightDir0), 0.0);
        vec3 lambert = baseColor * (
          uAmbient
          + uLightColor0 * keyLight
          + uLightColor1 * max(dot(N, uLightDir1), 0.0)
        );

        // 普通碎片保留克制的冷色边缘；Hover / Focus 碎片整面切换为原始高饱和分类色，
        // 只保留 12% 的面向明暗，避免仅受光面变色或再次产生柔光。
        float fresnel = pow(1.0 - abs(dot(N, V)), uFresnelPower);
        vec3 rim = uRimColor * fresnel * uFresnelStrength;
        vec3 normalColor = lambert + rim + baseColor * uCoreGlow;
        vec3 hoverColor = baseColor * (0.9 + keyLight * 0.12);
        vec3 color = mix(normalColor, hoverColor, hoverMask);

        gl_FragColor = vec4(color, 1.0);
        #include <fog_fragment>
      }
    `,
    fog: true,
  })
}

/** 低多边形冰山材质：半透明冰体，带轻微自发光冷色 */
export function createIceMaterial(): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color: 0xdcf2ff,
    roughness: 0.55,
    metalness: 0.05,
    flatShading: true,
    emissive: 0x021526,
    emissiveIntensity: 0.7,
    transparent: true,
    opacity: 0.92,
  })
}
