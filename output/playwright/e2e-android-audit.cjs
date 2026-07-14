const targetsUrl = "http://127.0.0.1:9222/json";

async function connect() {
  const targets = await fetch(targetsUrl).then((response) => response.json());
  const target = targets.find((item) => item.type === "page");
  if (!target) throw new Error("No se encontró el WebView de Entrena con IA");

  const socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    socket.addEventListener("open", resolve, { once: true });
    socket.addEventListener("error", reject, { once: true });
  });

  let id = 0;
  const pending = new Map();
  socket.addEventListener("message", ({ data }) => {
    const message = JSON.parse(data);
    const handler = pending.get(message.id);
    if (handler) {
      pending.delete(message.id);
      handler(message);
    }
  });

  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const commandId = ++id;
    pending.set(commandId, (message) => message.error ? reject(message.error) : resolve(message.result));
    socket.send(JSON.stringify({ id: commandId, method, params }));
  });

  const evaluate = async (expression) => {
    const result = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.text);
    return result.result.value;
  };

  return { socket, evaluate, target };
}

(async () => {
  const { socket, evaluate, target } = await connect();
  const command = process.argv[2] || "dump";

  if (command === "fill") {
    const values = JSON.parse(process.argv[3]);
    await evaluate(`(() => {
      const values = ${JSON.stringify(values)};
      const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
      const setSelectValue = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value").set;
      const setTextAreaValue = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value").set;
      for (const [name, value] of Object.entries(values)) {
        const element = document.querySelector('[name="' + name + '"]');
        if (!element) throw new Error("Campo no encontrado: " + name);
        if (element instanceof HTMLSelectElement) setSelectValue.call(element, value);
        else if (element instanceof HTMLTextAreaElement) setTextAreaValue.call(element, value);
        else if (element.type === "checkbox") element.click();
        else setValue.call(element, value);
        element.dispatchEvent(new Event("input", { bubbles: true }));
        element.dispatchEvent(new Event("change", { bubbles: true }));
      }
      return true;
    })()`);
  }

  if (command === "click") {
    const text = process.argv[3];
    await evaluate(`(() => {
      const text = ${JSON.stringify(text)};
      const element = Array.from(document.querySelectorAll("button")).find((button) => button.innerText.trim() === text);
      if (!element) throw new Error("Botón no encontrado: " + text);
      element.click();
      return true;
    })()`);
  }

  if (command === "tag") {
    const [placeholder, value] = JSON.parse(process.argv[3]);
    await evaluate(`(() => {
      const placeholder = ${JSON.stringify(placeholder)};
      const value = ${JSON.stringify(value)};
      const element = Array.from(document.querySelectorAll("input")).find((input) => input.placeholder === placeholder);
      if (!element) throw new Error("Campo de etiquetas no encontrado: " + placeholder);
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
      setter.call(element, value);
      element.dispatchEvent(new Event("input", { bubbles: true }));
      element.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", code: "Enter", bubbles: true }));
      return true;
    })()`);
  }

  if (command === "click-selector") {
    const [selector, index] = JSON.parse(process.argv[3]);
    await evaluate(`(() => {
      const selector = ${JSON.stringify(selector)};
      const index = ${Number(process.argv[3] ? JSON.parse(process.argv[3])[1] : 0)};
      const element = document.querySelectorAll(selector)[index];
      if (!element) throw new Error("Elemento no encontrado: " + selector + "[" + index + "]");
      element.click();
      return true;
    })()`);
  }

  if (command === "click-context") {
    const [text, context] = JSON.parse(process.argv[3]);
    await evaluate(`(() => {
      const text = ${JSON.stringify(text)};
      const context = ${JSON.stringify(context)};
      const element = Array.from(document.querySelectorAll("button")).find((button) =>
        button.innerText.trim() === text && button.parentElement?.parentElement?.parentElement?.innerText.includes(context)
      );
      if (!element) throw new Error("Botón contextual no encontrado: " + text + " / " + context);
      element.click();
      return true;
    })()`);
  }

  if (command === "click-contains") {
    const text = process.argv[3];
    await evaluate(`(() => {
      const text = ${JSON.stringify(process.argv[3])};
      const element = Array.from(document.querySelectorAll("button")).find((button) => button.innerText.includes(text));
      if (!element) throw new Error("Botón no encontrado: " + text);
      element.click();
      return true;
    })()`);
  }

  if (command === "redirect-relative-api") {
    await evaluate(`(() => {
      if (window.__e2eOriginalFetch) return true;
      window.__e2eOriginalFetch = window.fetch.bind(window);
      window.fetch = (input, init) => {
        const url = typeof input === "string" ? input : input.url;
        const redirected = url.startsWith("/api/") ? "http://10.0.2.2:3010" + url : input;
        return window.__e2eOriginalFetch(redirected, init);
      };
      return true;
    })()`);
  }

  if (command !== "dump") {
    await new Promise((resolve) => setTimeout(resolve, 800));
  }
  const fields = await evaluate(`Array.from(document.querySelectorAll("input, select, textarea, button")).map((element) => ({
    tag: element.tagName,
    type: element.type || null,
    name: element.name || null,
    text: element.innerText || null,
    context: element.parentElement?.parentElement?.parentElement?.innerText?.slice(0, 400) || null,
    value: element.value || null,
    placeholder: element.placeholder || null,
    checked: element.checked || false,
  }))`);
  console.log(JSON.stringify({ url: target.url, title: target.title, fields }, null, 2));
  socket.close();
})();
