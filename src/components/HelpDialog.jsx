import { useState } from 'react'

const TABS = [
  { key: 'start',   label: 'Getting Started' },
  { key: 'roblox',  label: 'Roblox' },
  { key: 'unreal',  label: 'Unreal' },
  { key: 'unity',   label: 'Unity' },
  { key: 'blender', label: 'Blender' },
  { key: 'tips',    label: 'Tips' },
  { key: 'contact', label: 'Contact' },
]

export default function HelpDialog({ onClose }) {
  const [tab, setTab] = useState('start')
  return (
    <div className="help-page">
      <div className="help-head">
        <button className="help-close" onClick={onClose}>← Back</button>
        <h1>Help</h1>
        <div className="help-tabs">
          {TABS.map(t => (
            <button
              key={t.key}
              className={`help-tab${tab === t.key ? ' active' : ''}`}
              onClick={() => setTab(t.key)}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="help-body">
        {tab === 'start'   && <Start />}
        {tab === 'roblox'  && <Roblox />}
        {tab === 'unreal'  && <Unreal />}
        {tab === 'unity'   && <Unity />}
        {tab === 'blender' && <Blender />}
        {tab === 'tips'    && <Tips />}
        {tab === 'contact' && <Contact />}
      </div>
    </div>
  )
}

function Start() {
  return (
    <article>
      <h2>What Plixiele does</h2>
      <p>
        You describe what you want; Plixiele generates a 3D model with custom GLSL shaders,
        previews it live, and exports it as <code>.glb</code> (the standard 3D format every
        engine reads).
      </p>

      <h2>Workspaces</h2>
      <ul>
        <li><strong>Text to 3D</strong> — describe a model in words.</li>
        <li><strong>Image to 3D</strong> — drop a reference image, get a model inspired by it.</li>
        <li><strong>Coding Buddy</strong> — pair-program with Claude on any code.</li>
        <li><strong>Community</strong> — browse + reuse models published by other creators.</li>
        <li><strong>Labs</strong> — Scene Builder, Shader Lab, Sound Lab, Weapon Generator.</li>
      </ul>

      <h2>Saving + exporting</h2>
      <ol>
        <li>Generate a model (Text to 3D, Image to 3D, or any Labs tool).</li>
        <li>The viewer toolbar has download buttons: <strong>PNG</strong> (snapshot of the preview)
        and <strong>GLB</strong> (the actual 3D model file).</li>
        <li>Saved chats persist automatically. Saved weapons/models live in their own libraries
        inside Labs.</li>
      </ol>

      <h2>Credits</h2>
      <p>
        Each generation costs credits (10 for a model, 2 for a chat reply, 50 for a sound,
        15 for a weapon). Your plan resets credits monthly. Upgrade in <strong>Pricing</strong>
        for more headroom.
      </p>
    </article>
  )
}

function Roblox() {
  return (
    <article>
      <h2>Roblox Studio plugin (recommended)</h2>
      <p>
        Generate models <em>inside</em> Studio with a prompt. Installs as a one-file plugin;
        uses your Plixiele credits.
      </p>

      <h3>Install</h3>
      <ol>
        <li>In Plixiele: <strong>Account → API Keys</strong>, click <strong>Generate key</strong>.
          Copy the key (you only see it once).</li>
        <li><a href="/plixiele-plugin.rbxmx" download>Download the Plixiele plugin</a>
          (<code>.rbxmx</code>).</li>
        <li>In Roblox Studio: <strong>Plugins tab → Plugins Folder</strong>. This opens File
          Explorer. Drop the downloaded file in.</li>
        <li>Close and reopen Studio. A <strong>Plixiele</strong> button appears in the Plugins
          toolbar.</li>
      </ol>

      <h3>Use</h3>
      <ol>
        <li>Click the Plixiele button to open the side panel.</li>
        <li>Paste your API key (saved between sessions).</li>
        <li>Type a prompt, hit <strong>Generate</strong>. Parts appear in your workspace
          inside a Model named <code>Plixiele_yourPrompt</code>.</li>
        <li>Each generation costs the same credits as one in-app generation (10 credits).</li>
      </ol>

      <h3>Caveats (plugin v1)</h3>
      <ul>
        <li><strong>Custom GLSL shaders don't run in Roblox.</strong> The plugin bakes the
          dominant color from each shader into a SmoothPlastic Roblox material.</li>
        <li><strong>Lathe/Extrude shapes are placeholders for now</strong> — they show as a
          ball. v2 will use Roblox's <code>EditableMesh</code> API to construct them properly.</li>
        <li>Cone, Torus, Octahedron etc. are approximated with the closest Roblox primitive.</li>
      </ul>

      <h2>Manual GLB import (alternative)</h2>
      <p>
        If you want full mesh fidelity (Roblox's GLB importer handles the geometry better
        than our v1 plugin), download the GLB and import via Asset Manager.
      </p>

      <h3>Steps</h3>
      <ol>
        <li>In Plixiele, open the model and click <strong>↓ GLB</strong> in the viewer toolbar.</li>
        <li>Open Roblox Studio. <strong>View → Asset Manager</strong>.</li>
        <li>Click <strong>Bulk Import</strong> and select your <code>.glb</code>.</li>
        <li>After upload, find the imported mesh under <strong>Meshes</strong> and drag it
          into the workspace.</li>
      </ol>
    </article>
  )
}

function Unreal() {
  return (
    <article>
      <h2>Importing into Unreal Engine 5</h2>
      <p>
        Unreal 5 supports glTF/GLB out of the box via the built-in Interchange Framework.
      </p>

      <h3>Steps</h3>
      <ol>
        <li>In Plixiele, click <strong>↓ GLB</strong> to download the model.</li>
        <li>In Unreal, open your project and find the <strong>Content Drawer</strong>
          (<kbd>Ctrl</kbd>+<kbd>Space</kbd>).</li>
        <li>Drag the <code>.glb</code> file into a folder, or click <strong>Import</strong>.</li>
        <li>The Import Options dialog opens. Defaults are usually correct. Click
          <strong>Import All</strong>.</li>
        <li>Unreal generates a <strong>Static Mesh</strong> asset, plus auto-created
          <strong>Material Instances</strong> for each material in the GLB.</li>
        <li>Drag the Static Mesh from the Content Drawer into your level viewport to place it.</li>
      </ol>

      <h3>Caveats</h3>
      <ul>
        <li>Custom GLSL shaders don't translate to Unreal's HLSL. The auto-generated material
          uses Unreal's PBR with the baked base color from the original shader.</li>
        <li>For shader fidelity, recreate the look in <strong>Material Editor</strong>
          (Material Graph) using the original shader code as reference.</li>
        <li>If you want collision, set <strong>Collision Complexity</strong> in the imported
          mesh's properties or use Auto Convex.</li>
      </ul>
    </article>
  )
}

function Unity() {
  return (
    <article>
      <h2>Importing into Unity</h2>
      <p>
        Unity doesn't import GLB natively. Install <strong>glTFast</strong> (the Khronos-blessed
        importer) from the Package Manager — it's free and one-time.
      </p>

      <h3>Setup (one-time)</h3>
      <ol>
        <li>In Unity, open <strong>Window → Package Manager</strong>.</li>
        <li>Click the <strong>+</strong> button → <strong>Add package by name</strong>.</li>
        <li>Enter <code>com.unity.cloud.gltfast</code> and click <strong>Add</strong>.</li>
      </ol>

      <h3>Steps (each model)</h3>
      <ol>
        <li>In Plixiele, click <strong>↓ GLB</strong>.</li>
        <li>Drag the <code>.glb</code> into your Unity <strong>Assets</strong> folder.</li>
        <li>Unity creates a prefab automatically. Drag the prefab into your scene.</li>
        <li>Materials become <strong>Standard</strong> shader instances with the GLB's base
          color and metallic/roughness values baked in.</li>
      </ol>

      <h3>Caveats</h3>
      <ul>
        <li>Same shader story as Unreal/Roblox — custom GLSL doesn't carry over. Recreate the
          look in <strong>Shader Graph</strong> or write a custom shader.</li>
        <li>If your Plixiele model uses transparent shaders, switch the Unity material's
          Rendering Mode to <strong>Transparent</strong> after import.</li>
      </ul>
    </article>
  )
}

function Blender() {
  return (
    <article>
      <h2>Importing into Blender</h2>
      <p>
        Blender 3.x and 4.x import glTF/GLB natively — no plugins needed.
      </p>

      <h3>Steps</h3>
      <ol>
        <li>In Plixiele, click <strong>↓ GLB</strong>.</li>
        <li>In Blender: <strong>File → Import → glTF 2.0 (.glb/.gltf)</strong>.</li>
        <li>Select your <code>.glb</code> and click <strong>Import glTF 2.0</strong>.</li>
        <li>Model appears at the world origin. Use standard Blender controls
          (<kbd>G</kbd> grab, <kbd>R</kbd> rotate, <kbd>S</kbd> scale) to position.</li>
      </ol>

      <h3>Tip — generate Blender Python directly</h3>
      <p>
        Plixiele has a <strong>Blender</strong> renderer mode. Switch the renderer dropdown
        in the Text-to-3D pane and you'll get a Blender Python script instead of a Three.js
        scene. Paste it into Blender's <strong>Scripting</strong> tab and run — the model
        builds inside Blender natively, with full procedural materials.
      </p>
    </article>
  )
}

function Contact() {
  return (
    <article>
      <h2>Email support</h2>
      <p>
        Send a question or bug report to{' '}
        <a href="mailto:help@plixiele.com">help@plixiele.com</a>. Our AI assistant
        replies usually within a minute, and a human follows up on anything
        billing- or account-related within 24 hours.
      </p>

      <h3>What to include for the fastest help</h3>
      <ul>
        <li>The exact error message you saw, copy-pasted (no screenshot needed for text errors).</li>
        <li>Which workspace you were in (Text to 3D, Labs → Weapon Generator, Roblox plugin, etc.).</li>
        <li>What you were doing right before it broke ("I clicked Generate after switching to Stylized").</li>
        <li>Your browser + OS if it's a UI bug ("Chrome 122 on Windows 11").</li>
        <li>A screenshot for layout / visual issues.</li>
      </ul>

      <h3>What we won't do over email</h3>
      <ul>
        <li>Process refunds or change subscription plans — those go through Stripe's customer
          portal (Account Settings → Manage subscription).</li>
        <li>Reset passwords without verification — use the in-app Change Password flow
          (Account Settings → Security).</li>
      </ul>

      <h3>Privacy</h3>
      <p>
        Your email + message content is sent to Anthropic Claude to generate the reply,
        and stored in Mailgun's logs for 5 days. Don't email us API keys, passwords, or
        other secrets. We won't ever ask for them.
      </p>
    </article>
  )
}

function Tips() {
  return (
    <article>
      <h2>Better generations</h2>
      <ul>
        <li><strong>Be specific.</strong> "Ornate Greek vase with gold trim and red glazed
          interior" beats "a vase". The model uses every adjective.</li>
        <li><strong>Mention materials.</strong> Words like <em>brushed metal</em>,
          <em>frosted glass</em>, <em>matte ceramic</em>, <em>polished obsidian</em> all
          land — the system prompt teaches the AI to map them to shader code.</li>
        <li><strong>Use the Style dropdowns</strong> where they exist (Weapon Generator's
          Realistic / Stylized / Low-poly / Sci-fi). They steer the silhouette dramatically.</li>
        <li><strong>Regenerate</strong> if the first try is off — generations are non-deterministic
          and a second pass often nails it.</li>
      </ul>

      <h2>Better shapes</h2>
      <p>
        The model can use <strong>LatheGeometry</strong> (perfect for vases, columns, sword
        pommels) and <strong>ExtrudeGeometry</strong> (perfect for blades, crowns, gears).
        If you ask for something rotationally symmetric and it gives you stacked cylinders,
        retry with the explicit hint: "use LatheGeometry".
      </p>

      <h2>Tweak after generation</h2>
      <ul>
        <li><strong>Shader Lab</strong> (in Labs) lets you tweak GLSL uniforms and shader
          source on any saved model in real time.</li>
        <li><strong>Scene Builder</strong> lets you arrange multiple models with terrain.</li>
        <li>The <strong>wireframe</strong> button in the viewer toolbar shows the underlying
          geometry — useful for debugging weird-looking models.</li>
      </ul>

      <h2>Publishing to Community</h2>
      <p>
        Hit <strong>Publish</strong> in the viewer toolbar. Add a title and tags, and your
        model joins the Community feed where everyone (including you on other devices) can
        load it back into Plixiele.
      </p>
    </article>
  )
}
