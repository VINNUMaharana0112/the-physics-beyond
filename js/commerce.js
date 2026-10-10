(() => {
    const apiBase = document.querySelector('meta[name="commerce-api-base"]')?.content.trim().replace(/\/+$/, '');
    if (!apiBase) return;

    let apiUrl;
    try {
        apiUrl = new URL(apiBase);
        if (apiUrl.protocol !== 'https:' && apiUrl.hostname !== 'localhost' && apiUrl.hostname !== '127.0.0.1') return;
    } catch {
        return;
    }

    let checkoutScript;
    const loadCheckout = () => {
        if (window.Razorpay) return Promise.resolve();
        if (!checkoutScript) {
            checkoutScript = new Promise((resolve, reject) => {
                const script = document.createElement('script');
                script.src = 'https://checkout.razorpay.com/v1/checkout.js';
                script.onload = resolve;
                script.onerror = () => reject(new Error('Secure checkout could not be loaded.'));
                document.head.append(script);
            });
        }
        return checkoutScript;
    };

    async function post(path, body) {
        const response = await fetch(`${apiBase}${path}`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(body),
            credentials: 'omit',
            cache: 'no-store',
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(result.error || 'Checkout could not be started. Please try again.');
        return result;
    }

    function shippingAddress(form) {
        return Object.fromEntries(['name', 'line1', 'city', 'state', 'postalCode', 'country']
            .map((name) => [name, form.elements.namedItem(name).value.trim()]));
    }

    async function startCheckout(form, product, method) {
        const status = form.querySelector('[data-checkout-status]');
        const buttons = [...form.querySelectorAll('button[type="submit"]')];
        buttons.forEach((item) => { item.disabled = true; });
        status.textContent = 'Connecting securely…';
        try {
            const quantity = Number(form.elements.namedItem('quantity').value);
            const order = await post('/api/orders', {
                productId: product.id,
                quantity,
                email: form.elements.namedItem('email').value.trim(),
                shippingAddress: shippingAddress(form),
                checkoutMethod: method,
            });
            if (method === 'payment_link') {
                const link = new URL(order.paymentLinkUrl);
                if (link.protocol !== 'https:' || link.hostname !== 'rzp.io') throw new Error('The payment provider returned an invalid checkout link.');
                window.location.assign(link.href);
                return;
            }
            await loadCheckout();
            const checkout = new window.Razorpay({
                key: order.razorpayKeyId,
                order_id: order.razorpayOrderId,
                amount: order.amount,
                currency: order.currency,
                name: 'The Physics Beyond',
                description: product.title,
                prefill: { email: form.elements.namedItem('email').value.trim() },
                handler: async (payment) => {
                    status.textContent = 'Verifying payment…';
                    try {
                        const verified = await post('/api/payments/verify', {
                            orderId: order.orderId,
                            razorpay_order_id: payment.razorpay_order_id,
                            razorpay_payment_id: payment.razorpay_payment_id,
                            razorpay_signature: payment.razorpay_signature,
                        });
                        status.textContent = verified.status === 'paid' ? 'Payment confirmed. We will contact you about delivery.' : 'Payment is being confirmed. Please check back shortly.';
                    } catch (error) {
                        status.textContent = error.message;
                    } finally {
                        buttons.forEach((item) => { item.disabled = false; });
                    }
                },
                modal: { ondismiss: () => { status.textContent = 'Checkout closed. You can try again.'; buttons.forEach((item) => { item.disabled = false; }); } },
            });
            checkout.on('payment.failed', () => {
                status.textContent = 'Payment was not completed. You can try again.';
                buttons.forEach((item) => { item.disabled = false; });
            });
            checkout.open();
        } catch (error) {
            status.textContent = error.message;
            buttons.forEach((item) => { item.disabled = false; });
        }
    }

    async function enableProduct(form) {
        try {
            const response = await fetch(`${apiBase}/api/products`, { credentials: 'omit', cache: 'no-store' });
            if (!response.ok) return;
            const { products = [] } = await response.json();
            const product = products.find((item) => item.slug === form.dataset.productSlug);
            if (!product) return;
            const price = document.querySelector('.product-price');
            if (price && Number.isSafeInteger(Number(product.priceMinor))) {
                price.textContent = new Intl.NumberFormat('en-IN', { style: 'currency', currency: product.currency }).format(Number(product.priceMinor) / 100);
            }
            form.querySelector('[data-checkout-method="payment_link"]').hidden = !product.paymentLinkEnabled;
            form.hidden = false;
        } catch {
            // Keep the existing enquiry option available when the API is offline.
        }
    }

    document.querySelectorAll('[data-commerce-product]').forEach((form) => {
        enableProduct(form);
        form.addEventListener('submit', (event) => {
            event.preventDefault();
            if (!form.reportValidity()) return;
            const button = event.submitter;
            const productPromise = fetch(`${apiBase}/api/products`, { credentials: 'omit', cache: 'no-store' }).then((response) => {
                if (!response.ok) throw new Error('The product catalogue is unavailable.');
                return response.json();
            });
            productPromise.then(({ products = [] }) => {
                const product = products.find((item) => item.slug === form.dataset.productSlug);
                if (!product) throw new Error('This product is no longer available.');
                return startCheckout(form, product, button.dataset.checkoutMethod);
            }).catch((error) => {
                form.querySelector('[data-checkout-status]').textContent = error.message;
            });
        });
    });
})();
