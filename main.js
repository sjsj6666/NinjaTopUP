const phonePrefixes = [
  { code: '+65', name: 'Singapore' },
  { code: '+60', name: 'Malaysia' },
  { code: '+62', name: 'Indonesia' },
  { code: '+63', name: 'Philippines' },
  { code: '+66', name: 'Thailand' },
  { code: '+84', name: 'Vietnam' },
  { code: '+91', name: 'India' },
  { code: '+1', name: 'United States' },
  { code: '+44', name: 'United Kingdom' },
  { code: '+61', name: 'Australia' }
];

let cart = [];
let slideIndex = 1;
let userPoints = 0;
let appliedVoucher = null;
let reviews = [];
let currentUser = null;
let currentOrder = null;

async function checkSuspensionStatus() {
    if (!currentUser) return;
    const cacheKey = `suspension_${currentUser.id}`;
    const cachedStatus = localStorage.getItem(cacheKey);
    const cacheTimestamp = localStorage.getItem(`${cacheKey}_timestamp`);
    const cacheTTL = 5 * 60 * 1000; // 5 minutes
    if (cachedStatus && cacheTimestamp && (Date.now() - parseInt(cacheTimestamp) < cacheTTL)) {
        if (cachedStatus === 'true') {
            handleSuspension();
        }
        return;
    }
    try {
        const { data, error } = await window.supabase
            .from('users')
            .select('is_suspended')
            .eq('id', currentUser.id)
            .single();
        if (error) throw error;
        const isSuspended = data?.is_suspended || false;
        localStorage.setItem(cacheKey, isSuspended.toString());
        localStorage.setItem(`${cacheKey}_timestamp`, Date.now().toString());
        if (isSuspended) handleSuspension();
    } catch (error) {
        console.error('Suspension check failed:', error);
        showNotification('Error checking account status.');
    }
}

function handleSuspension() {
    console.log('User suspended:', currentUser.email);
    showNotification('Your account is suspended. Please contact support.');
    window.supabase.auth.signOut().then(() => {
        currentUser = null;
        updateLoginStatus();
        history.pushState({ page: 'game-selection' }, 'Game Selection', '/');
        showPage('game-selection');
    });
}

async function updateLoginStatus() {
    const loginStatus = document.getElementById('login-status');
    const dropdownArrow = document.getElementById('dropdown-arrow');
    const userDropdown = document.getElementById('user-dropdown');

    if (currentUser) {
        let displayName = currentUser.user_metadata?.full_name || currentUser.email.split('@')[0];
        console.log('Initial displayName from user_metadata:', displayName);

        try {
            const { data: profile, error } = await window.supabase
                .from('profiles')
                .select('full_name')
                .eq('id', currentUser.id)
                .single();

            if (error && error.code !== 'PGRST116') {
                console.error('Error fetching profile:', error.message);
            } else if (profile?.full_name) {
                displayName = profile.full_name;
                console.log('Updated displayName from profiles:', displayName);
            }
        } catch (error) {
            console.error('Unexpected error fetching profile:', error);
        }

        loginStatus.textContent = `Welcome, ${displayName}`;
        loginStatus.style.cursor = 'pointer';
        dropdownArrow.style.display = 'inline';
        userDropdown.style.display = 'none';
        loginStatus.onclick = () => {
            userDropdown.style.display = userDropdown.style.display === 'block' ? 'none' : 'block';
        };
    } else {
        loginStatus.textContent = 'Login';
        loginStatus.style.cursor = 'pointer';
        dropdownArrow.style.display = 'none';
        userDropdown.style.display = 'none';
        loginStatus.onclick = () => {
            history.pushState({ page: 'login-page' }, 'Login', '/login-page');
            showPage('login-page');
        };
    }
}

function reattachEventListeners() {
    const navLinks = document.querySelectorAll('.top-nav > ul > li > a, .top-nav .dropdown-content a');
    navLinks.forEach((link, index) => {
        link.removeEventListener('click', link.clickHandler);
        link.clickHandler = function(e) {
            e.preventDefault();
            const page = this.getAttribute('href').slice(1);
            const method = this.getAttribute('data-method');
            console.log(`Nav link #${index} clicked:`, page, 'Method:', method);
            if (page === 'game-selection') {
                history.pushState({ page: page }, 'Game Selection', '/');
                showPage('game-selection');
                filterGameCards('all');
            } else if (page === 'products') {
                history.pushState({ page: 'game-selection' }, 'Products', '/products');
                showPage('game-selection');
                filterGameCards('all');
            } else if (method) {
                history.pushState({ page: 'game-selection', method }, 'Game Selection', `/products?method=${method}`);
                showPage('game-selection');
                filterGameCards(method);
            } else if (page === 'past-transactions') {
                history.pushState({ page: page }, 'Past Transactions', '/past-transactions');
                showPastTransactions();
            } else if (page === 'user-orders') {
                history.pushState({ page: page }, 'User Orders', '/user-orders');
                loadUserOrders();
            } else if (page === 'contact-us') {
                history.pushState({ page: page }, 'Contact Us', '/contact-us');
                showPage('contact-us');
            } else if (page === 'reviews') {
                history.pushState({ page: page }, 'Reviews', '/reviews');
                showReviews();
            } else if (page === 'redeem-points') {
                history.pushState({ page: page }, 'Redeem Points', '/redeem-points');
                showPage('redeem-points');
            } else {
                history.pushState({ page: page }, page.charAt(0).toUpperCase() + page.slice(1), `/${page}`);
                showPage(page);
            }
            const slider = document.querySelector('.slideshow-container');
            if (slider && (page === 'game-selection' || page === 'products' || method)) slider.style.display = 'block';
        };
        link.addEventListener('click', link.clickHandler);
    });

    const gameCards = document.querySelectorAll('.game-card');
    console.log('Reattach - Found', gameCards.length, 'game cards');
    gameCards.forEach((card, index) => {
        card.removeEventListener('click', card.clickHandler);
        card.clickHandler = function(e) {
            e.stopPropagation();
            e.preventDefault();
            const game = this.getAttribute('data-game');
            const method = this.getAttribute('data-method') || 'uid';
            console.log(`Game card #${index} clicked: ${game}, Method: ${method}`);
            if (game) {
                showTopupForm(game, method);
                history.pushState({ page: 'topup-form', game, method }, `${game} Top-Up`, `/topup/${game}`);
            }
        };
        card.addEventListener('click', card.clickHandler, { capture: true });
    });
}

async function handleAuthCallback() {
    const url = new URL(window.location.href);
    const path = url.pathname.slice(1);
    const searchParams = url.searchParams;
    const accessToken = searchParams.get('access_token');
    const refreshToken = searchParams.get('refresh_token');

    console.log('handleAuthCallback triggered. Path:', path);

    if (path === 'auth-callback' && accessToken && refreshToken) {
        try {
            const { data, error } = await window.supabase.auth.setSession({
                access_token: accessToken,
                refresh_token: refreshToken
            });
            if (error) throw error;

            if (data.session) {
                currentUser = data.session.user;
                console.log('Session set via tokens, user:', currentUser.email);
                console.log('User ID:', currentUser.id);
                console.log('Google user_metadata.full_name:', currentUser.user_metadata?.full_name);

                const { data: existingProfile, error: profileError } = await window.supabase
                    .from('profiles')
                    .select('full_name')
                    .eq('id', currentUser.id)
                    .single();

                if (profileError && profileError.code !== 'PGRST116') {
                    console.error('Error checking profile:', profileError.message);
                } else if (!existingProfile) {
                    const defaultName = currentUser.user_metadata?.full_name || currentUser.email.split('@')[0];
                    const { error: upsertError } = await window.supabase
                        .from('profiles')
                        .upsert(
                            { 
                                id: currentUser.id, 
                                full_name: defaultName, 
                                updated_at: new Date().toISOString() 
                            },
                            { onConflict: 'id' }
                        );
                    if (upsertError) {
                        console.error('Error upserting profile:', upsertError.message);
                    } else {
                        console.log('Created profile with default name:', defaultName);
                    }
                } else {
                    console.log('Existing profile found, not overwriting:', existingProfile.full_name);
                }

                await updateLoginStatus();
            history.pushState({ page: 'game-selection' }, 'Game Selection', '/');
            showPage('game-selection');
        }
        } catch (error) {
            console.error('Error in auth callback:', error.message);
            redirectToLogin();
        }
    }
}

function redirectToGameSelection() {
    setTimeout(() => {
        console.log('Redirecting to /');
        window.location.replace('https://doctopup.netlify.app/');
    }, 1500);
}

function redirectToLogin() {
    window.location.replace('https://doctopup.netlify.app/login-page');
}

// Call the callback handler on page load
handleAuthCallback();

function redirectToLogin() {
    window.location.replace('https://doctopup.netlify.app/login-page');
}

// Call the callback handler on page load
handleAuthCallback();

const reportedImageErrors = new Set();

function reattachImages() {
    const baseUrl = '/images/';
    const fallbackThumbnail = `${baseUrl}default-thumbnail.jpg`;

    const gameCards = document.querySelectorAll('.game-card');
    console.log(`Reattach - Found ${gameCards.length} game cards`);
    gameCards.forEach(card => {
        const game = card.getAttribute('data-game');
        const img = card.querySelector('img');
        if (img) {
            const imageSrc = `${baseUrl}${game}.png`;
            console.log(`Attempting to load image: ${imageSrc}`); // Debug log to check path
            img.src = imageSrc;
            img.onerror = () => {
                if (!reportedImageErrors.has(game)) {
                    console.error(`Failed to load thumbnail for ${game}`);
                    reportedImageErrors.add(game);
                }
                img.src = fallbackThumbnail;
            };
        }
    });

    const cartIconImg = document.getElementById('cart-icon-img');
    if (cartIconImg) {
        cartIconImg.src = `${baseUrl}cart.jpg`;
        cartIconImg.onerror = () => {
            if (!reportedImageErrors.has('cart')) {
                console.error('Failed to load cart icon');
                reportedImageErrors.add('cart');
            }
            cartIconImg.src = `${baseUrl}default-cart.jpg`;
        };
    }

    const savedState = history.state || {};
    if (savedState.page === 'topup-form' && savedState.game) {
        const game = savedState.game;
        const gameBanner = document.getElementById('game-banner');
        const gameDetailsScreenshot = document.getElementById('game-details-screenshot');
        if (gameBanner) {
            gameBanner.src = `${baseUrl}${game}-banner.jpg`;
            gameBanner.onerror = () => {
                if (!reportedImageErrors.has(`${game}-banner`)) {
                    console.error(`Failed to load banner for ${game}`);
                    reportedImageErrors.add(`${game}-banner`);
                }
                gameBanner.src = `${baseUrl}default-banner.jpg`;
            };
        }
        if (gameDetailsScreenshot) {
            gameDetailsScreenshot.src = `${baseUrl}${game}-details.jpg`;
            gameDetailsScreenshot.onerror = () => {
                if (!reportedImageErrors.has(`${game}-details`)) {
                    console.error(`Failed to load screenshot for ${game}`);
                    reportedImageErrors.add(`${game}-details`);
                }
                gameDetailsScreenshot.src = `${baseUrl}default-details.jpg`;
            };
        }
    }
}

if (!window.listenersAttached) {
    window.listenersAttached = true;
    window.addEventListener('hashchange', reattachImages);
}

document.addEventListener('DOMContentLoaded', async function() {
    console.log('DOM fully loaded - Main Site');
    const { data, error } = await window.supabase.auth.getSession();
    if (error) {
        console.error('Error checking session on load:', error.message);
    } else if (data.session) {
        currentUser = data.session.user;
        console.log('Session found on load, user:', currentUser.email);

        // Ensure profile exists
        const defaultName = currentUser.user_metadata?.full_name || currentUser.email.split('@')[0];
        await window.supabase
            .from('profiles')
            .upsert(
                { 
                    id: currentUser.id, 
                    full_name: defaultName, 
                    updated_at: new Date().toISOString() 
                },
                { onConflict: 'id' }
            );

        await checkSuspensionStatus(); // Check suspension status
        if (currentUser) { // Only update if not suspended
            await updateLoginStatus();
        }
    } else {
        console.log('No session found on load');
        currentUser = null;
        updateLoginStatus();
    }

    cart = JSON.parse(localStorage.getItem('ninjaCart')) || [];
    updateCart();

    if (window.listenersAttached) {
        reattachEventListeners(); // Replace separate attach calls
        attachFooterListeners();
        attachStarRatingListeners('review-rating');
        attachStarRatingListeners('review-prompt-rating');

        const ninjaTitle = document.getElementById('ninja-title');
        const cartIcon = document.getElementById('cart-icon');

        ninjaTitle.addEventListener('click', () => {
            history.pushState({ page: 'game-selection' }, 'Game Selection', '/');
            showPage('game-selection');
        });
        cartIcon.addEventListener('click', () => {
            history.pushState({ page: 'cart' }, 'Cart', '/cart');
            showCart();
        });
    }

    reattachImages(); // Call on load to restore images

    const ordersChannel = window.supabase
        .channel('orders')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, payload => {
            clearTimeout(window.ordersRefreshTimeout);
            window.ordersRefreshTimeout = setTimeout(() => showPastTransactions(), 1000);
        })
        .subscribe();

    window.addEventListener('beforeunload', () => {
        window.supabase.removeChannel(ordersChannel);
    });

    const reviewsChannel = window.supabase
        .channel('reviews')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'reviews' }, payload => {
            clearTimeout(window.reviewsRefreshTimeout);
            window.reviewsRefreshTimeout = setTimeout(() => showReviews(), 1000);
        })
        .subscribe();

    window.addEventListener('beforeunload', () => {
        window.supabase.removeChannel(reviewsChannel);
    });

    ninjaTitle.addEventListener('click', () => {
        history.pushState({ page: 'game-selection' }, 'Game Selection', '/');
        showPage('game-selection');
    });
    cartIcon.addEventListener('click', () => {
        history.pushState({ page: 'cart' }, 'Cart', '#cart');
        showCart();
    });

    function loadPageFromPath() {
        const path = window.location.pathname.slice(1); // Get path after /
        const savedState = history.state || { page: path || 'game-selection' };
        console.log('Restoring page from path:', path, 'State:', savedState);
    
        if (path.startsWith('topup/')) {
            const game = path.split('topup/')[1];
            if (game && gameOptions[game]) {
                showTopupForm(game);
                return;
            }
        } else if (path.startsWith('product/')) {
            const game = path.split('product/')[1];
            if (game && gameOptions[game]) {
                showTopupForm(game);
                return;
            }
        } else if (path === 'cart') {
            showCart();
            return;
        } else if (path === 'checkout') {
            showCheckout();
            return;
        } else if (path === 'past-transactions') {
            showPastTransactions();
            return;
        } else if (path === 'user-orders') {
            loadUserOrders();
            return;
        } else if (path === 'login-page') {
            showPage('login-page');
            return;
        } else if (path === 'user-profile') {
            loadUserProfile();
            return;
        } else if (path === 'reviews') {
            showReviews();
            return;
        } else if (path === 'redeem-points') {
            showPage('redeem-points');
            return;
        }
    
        if (savedState.page === 'topup-form' && savedState.game) {
            showTopupForm(savedState.game);
        } else if (savedState.page === 'past-transactions') {
            showPastTransactions();
        } else if (savedState.page === 'user-orders') {
            loadUserOrders();
        } else if (savedState.page === 'login-page') {
            showPage('login-page');
        } else if (savedState.page === 'user-profile') {
            loadUserProfile();
        } else if (savedState.page === 'review-page') {
            if (currentOrder && currentOrder.orderid) {
                showReviewPage();
            } else {
                console.log('No valid currentOrder, defaulting to game-selection');
                history.pushState({ page: 'game-selection' }, 'Game Selection', '/');
                showPage('game-selection');
            }
        } else {
            showPage(savedState.page || 'game-selection');
        }
    }
    // Force game-selection for local file:// protocol
    if (window.location.protocol === 'file:') {
        console.log('Local file detected, forcing game-selection');
        showPage('game-selection');
    } else {
        loadPageFromPath();
    }

    window.addEventListener('popstate', function(event) {
        console.log('Path changed to:', window.location.pathname, 'State:', event.state);
        loadPageFromPath();
        reattachImages(); // Move image reattachment here
    });
    
    // Remove the separate hashchange listener
    if (!window.listenersAttached) {
        window.listenersAttached = true;
        // No need for hashchange anymore
    }

    document.querySelectorAll('.copy-icon').forEach(icon => {
        icon.addEventListener('click', () => {
            const textToCopy = icon.getAttribute('data-copy');
            copyToClipboard(textToCopy, icon);
        });
    });

    window.supabase.auth.onAuthStateChange((event, session) => {
        currentUser = session?.user || null;
        const dropdownArrow = document.getElementById('dropdown-arrow');
        const userDropdown = document.getElementById('user-dropdown');
        const loginStatus = document.getElementById('login-status');
    
        if (currentUser) {
            console.log('User logged in:', currentUser.email, 'UID:', currentUser.id);
            loadUserData(currentUser.id);
            if (event === 'SIGNED_IN') {
                showNotification('Login successful! Welcome, ' + (currentUser.email.split('@')[0]));
                const url = new URL(window.location.href);
        if (url.pathname === '/auth/v1/callback') {
            window.location.href = 'https://doctopup.netlify.app/';
        } else {
            history.pushState({ page: 'game-selection' }, 'Game Selection', '/');
            showPage('game-selection');
        }
                reattachEventListeners(); // Ensure buttons work after login
            }
        } else {
            console.log('No user logged in');
            document.getElementById('login-form-container').style.display = 'block';
            reattachEventListeners(); // Ensure buttons work after logout
        }
        updateLoginStatus(); // Delegate all UI updates to updateLoginStatus()
        if (event === 'INITIAL_SESSION') {
            console.log('Initial session checked:', currentUser ? 'User logged in' : 'No user');
        }
    });

const googleLoginBtn = document.getElementById('google-login-btn');
if (googleLoginBtn) {
    console.log('Google login button found, attaching listener');
    console.log('Button visibility:', googleLoginBtn.style.display, 'Computed display:', window.getComputedStyle(googleLoginBtn).display);
    console.log('Button pointer-events:', window.getComputedStyle(googleLoginBtn).pointerEvents);
    let isLoggingIn = false; // Debounce flag
    googleLoginBtn.addEventListener('click', async () => {
        if (isLoggingIn) {
            console.log('Login already in progress, ignoring click');
            return;
        }
        isLoggingIn = true;
        console.log('Google login button clicked - Event triggered');
        try {
            const redirectTo = 'https://doctopup.netlify.app/auth-callback';
    const { data, error } = await window.supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
            redirectTo: redirectTo,
                    scopes: 'email profile',
                    query: { access_type: 'offline', prompt: 'consent' } // Force code flow
                }
            });
            if (error) {
                console.error('Google login error:', error.message, error);
                showNotification('Google Login Error: ' + error.message);
                throw error;
            }
            console.log('Google login initiated, data:', data);
            if (!data.url) {
                showNotification('Popup blocked. Please allow popups and try again.');
            }
        } catch (error) {
            console.error('Caught error:', error.message);
            showNotification('Error: ' + error.message);
        } finally {
            isLoggingIn = false;
        }
    });
    googleLoginBtn.addEventListener('mouseover', () => {
        console.log('Mouse over Google login button - Cursor should change');
    });
    const isInViewport = () => {
        const rect = googleLoginBtn.getBoundingClientRect();
        return (
            rect.top >= 0 &&
            rect.left >= 0 &&
            rect.bottom <= (window.innerHeight || document.documentElement.clientHeight) &&
            rect.right <= (window.innerWidth || document.documentElement.clientWidth)
        );
    };
    console.log('Button in viewport:', isInViewport());
} else {
    console.error('Google login button not found');
}

const emailLoginBtn = document.getElementById('email-login-btn');
if (emailLoginBtn) {
    emailLoginBtn.addEventListener('click', async (e) => {
        e.preventDefault();
        const email = document.getElementById('email-login-input')?.value.trim();
        const password = document.getElementById('password-login-input')?.value.trim();
        const whatsapp = document.getElementById('whatsapp-input')?.value.trim() || '';
        if (!email || !password) {
            showNotification('Please enter both email and password.');
            return;
        }
        try {
            const { data, error } = await window.supabase.auth.signInWithPassword({
                email: email,
                password: password
            });
            if (error) {
                if (error.message === 'Invalid login credentials') {
                    showNotification('Invalid email or password. If you just registered, please confirm your email first.');
                } else {
                    throw error;
                }
            } else {
                console.log('Email login success:', data.user.email);
                // Ensure user exists in users table
                const { data: userData, error: fetchError } = await window.supabase
                    .from('users')
                    .select('*')
                    .eq('id', data.user.id)
                    .single();
                if (fetchError && fetchError.code === 'PGRST116') {
                    const { error: insertError } = await window.supabase
                        .from('users')
                        .insert({
                            id: data.user.id,
                            email: email,
                            whatsapp: whatsapp,
                            points: 0
                        });
                    if (insertError) throw insertError;
                } else if (fetchError) {
                    throw fetchError;
                } else if (whatsapp && userData.whatsapp !== whatsapp) {
                    const { error: updateError } = await window.supabase
                        .from('users')
                        .update({ whatsapp: whatsapp })
                        .eq('id', data.user.id);
                    if (updateError) throw updateError;
                }
                await handleLoginSuccess(data.user); // Call the top-level function
            }
        } catch (error) {
            console.error('Email login error:', error);
            showNotification('Email Login Error: ' + error.message);
        }
    });
}

const emailRegisterBtn = document.getElementById('email-register-btn');
if (emailRegisterBtn) {
    emailRegisterBtn.addEventListener('click', async (e) => {
        e.preventDefault();
        const email = document.getElementById('email-login-input')?.value.trim();
        const password = document.getElementById('password-login-input')?.value.trim();
        const whatsapp = document.getElementById('whatsapp-input')?.value.trim() || '';
        if (!email || !password) {
            showNotification('Please enter both email and password.');
            return;
        }
        if (password.length < 6) {
            showNotification('Password must be at least 6 characters long.');
            return;
        }
        try {
            const { data, error } = await window.supabase.auth.signUp({
                email: email,
                password: password,
                options: {
                    data: { full_name: email.split('@')[0] },
                    redirectTo: window.location.origin + '#game-selection'
                }
            });
            if (error) throw error;
            console.log('Email registration success:', data.user.email);
            const { error: insertError } = await window.supabase
                .from('users')
                .insert({
                    id: data.user.id,
                    email: email,
                    whatsapp: whatsapp,
                    points: 0
                });
            if (insertError) throw insertError;
            showNotification('Registration successful! Please check your email to confirm, then log in.');
            // Clear inputs
            document.getElementById('email-login-input').value = '';
            document.getElementById('password-login-input').value = '';
            document.getElementById('whatsapp-input').value = '';
            // handleLoginSuccess(data.user); // Uncomment if email confirmation is OFF
        } catch (error) {
            console.error('Email registration error:', error);
            showNotification('Registration Error: ' + error.message);
        }
    });
}

const logoutBtn = document.getElementById('logout-btn');
if (logoutBtn) {
    logoutBtn.addEventListener('click', async () => {
        try {
            const { error } = await window.supabase.auth.signOut();
            if (error) throw error;
            console.log('User logged out');
            showNotification('Logged out successfully!');
            // Cart is preserved in localStorage, no need to reset unless explicit
            appliedVoucher = null; // Reset voucher only
            updateCart();
            history.pushState({ page: 'game-selection' }, 'Game Selection', '/');
    showPage('game-selection');
            await updateLoginStatus(); // Add await to ensure UI reflects logout
        } catch (error) {
            console.error('Logout error:', error);
            showNotification('Error: ' + error.message);
        }
    });
} else {
    console.error('Logout button NOT found in DOM');
}

document.getElementById('profile-link')?.addEventListener('click', (e) => {
    e.preventDefault();
    if (!currentUser) {
        history.pushState({ page: 'login-page' }, 'Login', '/login-page');
        showPage('login-page');
        return;
    }
    history.pushState({ page: 'user-profile' }, 'Profile', '/user-profile');
    loadUserProfile();
});
  document.getElementById('view-orders-link')?.addEventListener('click', () => loadUserOrders());
  document.getElementById('redeem-points-link')?.addEventListener('click', () => loadRedeemPoints());

  attachFooterListeners();
  attachStarRatingListeners('review-rating');
  attachStarRatingListeners('review-prompt-rating');
  initializePhonePrefixes();
  attachSlideListeners();
  setInitialStars('review-rating');
  setInitialStars('review-prompt-rating');

  const hamburger = document.querySelector('.hamburger');
  const navLinks = document.querySelector('.nav-links');
  const dropdowns = document.querySelectorAll('.dropdown');
  if (hamburger && navLinks) {
      hamburger.addEventListener('click', () => {
          navLinks.classList.toggle('active');
          console.log('Hamburger clicked, nav-links active:', navLinks.classList.contains('active'));
      });

      document.addEventListener('click', (e) => {
          if (window.innerWidth <= 768 && !navLinks.contains(e.target) && !hamburger.contains(e.target)) {
              navLinks.classList.remove('active');
              dropdowns.forEach(dropdown => dropdown.classList.remove('active'));
          }
      });

      dropdowns.forEach(dropdown => {
          const dropbtn = dropdown.querySelector('.dropbtn');
          dropbtn.addEventListener('click', (e) => {
              if (window.innerWidth <= 768) {
                  e.preventDefault();
                  dropdown.classList.toggle('active');
              }
          });
      });
  }

  const userIdInput = document.getElementById('user-id');
  if (userIdInput) {
      userIdInput.addEventListener('input', function() {
          this.value = this.value.replace(/\D/g, '');
      });
  }

  const serverMlbbInput = document.getElementById('server-mlbb');
  if (serverMlbbInput) {
      serverMlbbInput.addEventListener('input', function() {
          this.value = this.value.replace(/\D/g, '');
      });
  }

  const purchaseForm = document.getElementById('purchase-form');
  if (purchaseForm) {
      purchaseForm.onsubmit = function(e) {
          e.preventDefault();
          console.log('Add to Cart clicked');
  
          const userId = document.getElementById('user-id')?.value.trim() || '';
          const amount = document.getElementById('amount')?.value || '';
          const serverGenshin = document.getElementById('server-genshin')?.value || '';
          const serverMlbb = document.getElementById('server-mlbb')?.value || '';
          const serverHsr = document.getElementById('server-hsr')?.value || '';
          const serverZzz = document.getElementById('server-zzz')?.value || '';
          const game = history.state?.game || ''; // This is reliable from game card click
  
          if (!userId || !amount) {
              console.log('Missing:', { userId, amount });
              showNotification('Error: Please enter your Player ID and select an amount.');
              return;
          }
          if (game === 'genshin-impact' && !serverGenshin) {
              console.log('Missing server for Genshin');
              showNotification('Error: Please select a server for Genshin Impact.');
              return;
          }
          if ((game === 'mobile-legends' || game === 'mobile-legends-sg') && !serverMlbb) {
              console.log('Missing server for MLBB');
              showNotification('Error: Please enter a valid Server ID for Mobile Legends.');
              return;
          }
          if (game === 'honkai-star-rail' && !serverHsr) {
              console.log('Missing server for HSR');
              showNotification('Error: Please select a server for Honkai: Star Rail.');
              return;
          }
          if (game === 'zenless-zone-zero' && !serverZzz) {
              console.log('Missing server for ZZZ');
              showNotification('Error: Please select a server for Zenless Zone Zero.');
              return;
          }
  
          const options = gameOptions[game] || [];
          const selectedOption = options.find(opt => opt.value === amount);
          if (!selectedOption) {
              console.log('No selected option for amount:', amount);
              showNotification('Error: Please select a valid amount.');
              return;
          }
  
          // Friendly game name mapping
          const gameNames = {
              'mobile-legends': 'MLBB',
              'mobile-legends-sg': 'MLBB SG',
              'genshin-impact': 'Genshin Impact',
              'pubg-mobile': 'PUBG Mobile',
              'identity-v': 'Identity V',
              'bloodstrike': 'Bloodstrike',
              'honor-of-kings': 'Honor of Kings',
              'arena-breakout': 'Arena Breakout',
              'marvel-rivals': 'Marvel Rivals',
              'love-and-deepspace': 'Love and Deepspace',
              'marvel-snap': 'Marvel Snap',
              'zenless-zone-zero': 'Zenless Zone Zero',
              'honkai-star-rail': 'Honkai: Star Rail'
          };
          const displayGame = gameNames[game] || game || 'Unknown Game';
  
          const item = {
              game: displayGame, // Use mapped name or fallback to game ID
              userId: userId,
              server: game === 'genshin-impact' ? serverGenshin :
                      (game === 'mobile-legends' || game === 'mobile-legends-sg') ? serverMlbb :
                      game === 'honkai-star-rail' ? serverHsr :
                      game === 'zenless-zone-zero' ? serverZzz : '',
              amount: amount,
              description: selectedOption.text,
              price: selectedOption.price,
              orderId: 'NT' + Date.now()
          };
  
          console.log('Adding to cart:', item);
          cart.push(item);
          updateCart();
          showCartNotification(`${item.game}, ${item.amount} ${getCurrencyName(game)} was added to cart!`);
          
          window.scrollTo({
              top: 0,
              behavior: 'smooth'
          });
      };
  }

  const checkoutBtn = document.getElementById('checkout-btn');
if (checkoutBtn) {
    checkoutBtn.addEventListener('click', function() {
        history.pushState({ page: 'checkout' }, 'Checkout', '/checkout');
        showCheckout();
    });
}

  const applyVoucherBtn = document.getElementById('apply-voucher-btn');
  if (applyVoucherBtn) {
      applyVoucherBtn.addEventListener('click', function() {
          const voucherCode = document.getElementById('voucher-code-checkout')?.value.trim().toUpperCase() || '';
          if (voucherCode === 'NINJA10') {
              appliedVoucher = { code: voucherCode, discount: 0.10 };
              showNotification('Voucher applied: 10% discount!');
          } else {
              appliedVoucher = null;
              showNotification('Invalid or expired voucher code.');
          }
          showCheckout();
      });
  }

  function checkAML(userId, totalPrice) {
    const maxTransactionLimit = 10000; // Example limit in USD
    const checkoutEmail = document.getElementById('checkout-email')?.value.trim();
    const checkoutPhone = document.getElementById('checkout-phone')?.value.trim();

    if (totalPrice > maxTransactionLimit) {
        showNotification('Transaction exceeds limit. Please contact support for verification.');
        return false;
    }

    if (!checkoutEmail || !checkoutPhone) {
        showNotification('Please provide email and phone number in the checkout form.');
        return false;
    }

    // For logged-in users, optionally enforce profile completeness if desired
    if (currentUser && (!currentUser.email || !checkoutPhone)) {
        showNotification('Please ensure your profile email and checkout phone are complete.');
        return false;
    }

    return true;
}

const confirmPayment = document.getElementById('confirm-payment');
if (confirmPayment) {
    confirmPayment.addEventListener('click', async function(e) {
        e.preventDefault();
        this.disabled = true;
        const originalText = this.innerHTML;
        this.innerHTML = 'Processing...';

        const checkoutEmail = document.getElementById('checkout-email')?.value.trim();
        const checkoutPhone = document.getElementById('checkout-phone')?.value.trim();
        const cartItems = JSON.parse(localStorage.getItem('ninjaCart')) || [];

        if (!cartItems.length || !checkoutEmail || !checkoutPhone) {
            showNotification('Please fill in all details and add items to cart.');
            this.innerHTML = originalText;
            this.disabled = false;
            return;
        }

        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(checkoutEmail)) {
            showNotification('Please enter a valid email address.');
            this.innerHTML = originalText;
            this.disabled = false;
            return;
        }

        if (!/^\+\d{8,15}$/.test(checkoutPhone)) {
            showNotification('Please enter a valid phone number (e.g., +6512345678).');
            this.innerHTML = originalText;
            this.disabled = false;
            return;
        }

        for (const item of cartItems) {
            if (item.game.toLowerCase() === 'honkai-star-rail') {
                const uid = item.userId;
                const server = item.server || 'prod_official_asia';
                const result = await checkSmileOneUser("honkai-star-rail", uid, server);
                if (result.error) {
                    showNotification('Invalid HSR UID or Server. Please check and try again.');
                    this.innerHTML = originalText;
                    this.disabled = false;
                    return;
                }
            } else if (item.game.toLowerCase() === 'mobile-legends' || item.game.toLowerCase() === 'mobile-legends-sg') {
                const uid = item.userId;
                const server = item.server;
                const result = await checkSmileOneUser("mobile-legends", uid, server);
                if (result.error) {
                    showNotification('Invalid MLBB ID or Server. Please check and try again.');
                    this.innerHTML = originalText;
                    this.disabled = false;
                    return;
                }
            } else if (item.game.toLowerCase() === 'genshin-impact') {
                const uid = item.userId;
                const server = item.server;
                const result = await checkSmileOneUser("genshin-impact", uid, server);
                if (result.error) {
                    showNotification('Invalid Genshin UID or Server. Please check and try again.');
                    this.innerHTML = originalText;
                    this.disabled = false;
                    return;
                }
            }
        }

        // Only check suspension if user is logged in
        if (currentUser) {
            await checkSuspensionStatus();
            if (!currentUser) {
                this.innerHTML = originalText;
                this.disabled = false;
                showNotification('Your account is suspended. You can continue as a guest.');
            }
        }

        const totalPrice = cartItems.reduce((sum, item) => sum + item.price, 0);
        if (!checkAML(currentUser?.id || 'guest', totalPrice)) {
            this.innerHTML = originalText;
            this.disabled = false;
            return;
        }
        
        const order = {
            userid: currentUser?.id || null,
            orderid: 'NTX' + Math.random().toString(36).substr(2, 9).toUpperCase(),
            email: checkoutEmail,
            phone: checkoutPhone,
            items: cartItems,
            total: parseFloat(totalPrice.toFixed(2)),
            status: 'Verifying Payment',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            pointsearned: currentUser ? Math.floor(totalPrice * 100) : 0,
            reviewallowed: true
        };
        
        // Validate the order on the server
        const validateResponse = await fetch('/api/validate-order', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(order),
        });
        const validateData = await validateResponse.json();
        if (!validateResponse.ok) {
            throw new Error(validateData.error || 'Order validation failed');
        }
        
        try {
            const { data, error } = await window.supabase
                .from('orders')
                .insert([order])
                .select();
            if (error) throw error;
        
            // Send WhatsApp notification
            const message = `Thank you for your order! Your order ID is ${order.orderid}. Total: $${order.total.toFixed(2)}. We will process it shortly.`;
            await fetch('/api/send-notification', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    phone: checkoutPhone,
                    message: message,
                }),
            });
        
            currentOrder = data[0];
            cart = [];
            localStorage.setItem('ninjaCart', JSON.stringify([]));
            updateCart();
            showConfirmation(data[0]);
            hideCheckout();
            showNotification('Order placed successfully! Check WhatsApp for confirmation.');
            setTimeout(async () => {
                hideConfirmation();
                await showReviewPage();
                this.innerHTML = originalText;
                this.disabled = false;
            }, 2000);
        } catch (error) {
            console.error('Error processing order:', error.message);
            showNotification('Error placing order: ' + (error.message || 'Unknown error'));
            this.innerHTML = originalText;
            this.disabled = false;
        }
    });
}

// Replace the existing submitReviewBtn listener
const submitReviewBtn = document.getElementById('submit-review');
if (submitReviewBtn) {
    submitReviewBtn.addEventListener('click', async function() {
        const rating = document.getElementById('review-prompt-rating-value')?.value || 5;
        const text = document.getElementById('review-text')?.value.trim() || '';
        const trackingNumber = currentOrder?.orderid || document.getElementById('tracking-number')?.textContent || '';

        if (!text) {
            showNotification('Please write a review before submitting.');
            return;
        }

        if (!trackingNumber) {
            showNotification('No order selected for review.');
            return;
        }

        try {
            console.log('Submitting review for order:', trackingNumber);
            const { data: orderData, error: orderError } = await window.supabase
                .from('orders')
                .select('*')
                .eq('orderid', trackingNumber) // Fixed to lowercase
                .single();
            if (orderError) throw orderError;
            if (!orderData || !orderData.reviewallowed) { // Fixed to lowercase
                showNotification('Review already submitted or not allowed for this order.');
                return;
            }

            const username = orderData.userid || orderData.email.split('@')[0]; // Fixed to lowercase
            const review = {
                orderid: trackingNumber, // Fixed to lowercase
                username: username,
                rating: parseInt(rating),
                text: text,
                created_at: new Date().toISOString()
            };

            console.log('Review data:', JSON.stringify(review, null, 2));
            const { data, error: reviewError } = await window.supabase
                .from('reviews')
                .insert(review)
                .select();
            if (reviewError) throw reviewError;

            const { error: updateError } = await window.supabase
                .from('orders')
                .update({ reviewallowed: false }) // Fixed to lowercase
                .eq('orderid', trackingNumber); // Fixed to lowercase
            if (updateError) throw updateError;

            console.log('Review submitted successfully:', JSON.stringify(data, null, 2));
            showNotification('Thank you for your review!');
            document.getElementById('review-text').value = '';
            hideReviewPrompt();
            currentOrder = null; // Reset after successful submission
        } catch (error) {
            console.error('Error submitting review:', error);
            showNotification('Error submitting review: ' + error.message);
        }
    });
}

document.querySelectorAll('#rewards-list button').forEach(button => {
    button.addEventListener('click', async () => {
        const pointsRequired = parseInt(button.dataset.points);
        if (!currentUser) {
            showNotification('Please log in to redeem rewards.');
            return;
        }
        if (userPoints < pointsRequired) {
            showNotification('Not enough points to redeem this reward.');
            return;
        }
        try {
            userPoints -= pointsRequired;
            const { error } = await window.supabase
                .from('users')
                .update({ points: userPoints })
                .eq('id', currentUser.id);
            if (error) throw error;
            document.getElementById('user-points').textContent = userPoints;
            showNotification(`Reward redeemed! ${pointsRequired} points deducted.`);
        } catch (error) {
            console.error('Error redeeming reward:', error);
            showNotification('Error: ' + error.message);
        }
    });
});
});

async function handleLoginSuccess(user) {
    currentUser = user;
    console.log('User logged in:', user.email, 'UID:', user.id);
    await checkSuspensionStatus(); // Ensure this completes
    if (!currentUser) return; // Exit if suspended
    // Only proceed with UI updates or navigation if not suspended
    updateLoginStatus();
    history.pushState({ page: 'game-selection' }, 'Game Selection', '/');
    showPage('game-selection');
}

function copyToClipboard(text, icon) {
    navigator.clipboard.writeText(text).then(() => {
        // Create notification element
        const notification = document.createElement('span');
        notification.textContent = 'Copied to clipboard';
        notification.classList.add('copy-notification');
        
        // Get the payment-details container
        const paymentDetails = document.getElementById('payment-details');
        
        // Position it relative to the icon within payment-details
        const iconRect = icon.getBoundingClientRect();
        const containerRect = paymentDetails.getBoundingClientRect();
        notification.style.position = 'absolute';
        notification.style.left = `${iconRect.right - containerRect.left + 5}px`; // 5px right of icon
        notification.style.top = `${iconRect.top - containerRect.top}px`; // Aligned with icon top
        
        // Add it to payment-details instead of body
        paymentDetails.appendChild(notification);
        
        // Add 'copied' class to icon for visual feedback
        icon.classList.add('copied');
        
        // Remove notification and 'copied' class after 2 seconds
        setTimeout(() => {
            notification.remove();
            icon.classList.remove('copied');
        }, 2000);
    }).catch(err => {
        console.error('Failed to copy:', err);
        showNotification('Failed to copy text.');
    });
}

async function loadUserProfile() {
    const profileSection = document.getElementById('user-profile');
    if (!profileSection || !currentUser) {
        showNotification('Please log in to view your profile.');
        history.pushState({ page: 'login-page' }, 'Login', '#login-page');
        showPage('login-page');
        return;
    }

    document.querySelectorAll('main > section').forEach(section => section.style.display = 'none');
    profileSection.style.display = 'block';

    const emailInput = document.getElementById('edit-email');
    const usernameInput = document.getElementById('edit-username');
    emailInput.value = currentUser.email;

    const { data: profile, error } = await window.supabase
        .from('profiles')
        .select('full_name')
        .eq('id', currentUser.id)
        .single();

    let currentName = profile?.full_name || currentUser.user_metadata?.full_name || currentUser.email.split('@')[0];
    if (error && error.code !== 'PGRST116') console.error('Error fetching profile:', error.message);
    console.log('Loaded profile name:', currentName);

    usernameInput.value = currentName;

    document.getElementById('edit-profile-form').addEventListener('submit', async function(e) {
        e.preventDefault();
        const newUsername = usernameInput.value.trim();

        const { data, error: upsertError } = await window.supabase
            .from('profiles')
            .upsert(
                { 
                    id: currentUser.id, 
                    full_name: newUsername, 
                    updated_at: new Date().toISOString() 
                },
                { onConflict: 'id' }
            );

        if (upsertError) {
            console.error('Error updating profile:', upsertError.message);
            showNotification('Error updating profile: ' + upsertError.message);
        } else {
            console.log('Profile updated with name:', newUsername);
            showNotification('Profile updated successfully!');
            await updateLoginStatus();
            loadUserProfile(); // Refresh
        }
    }, { once: true });
}

async function loadUserOrders() {
    if (!currentUser) {
        showNotification('Please log in to view your orders.');
        history.pushState({ page: 'login-page' }, 'Login', '#login-page');
        showPage('login-page');
        return;
    }

    await checkSuspensionStatus(); // Add this
    if (!currentUser) return; // Exit if suspended

    document.querySelector('header').style.display = 'none';
    document.querySelector('.top-nav').style.display = 'none';

    document.querySelectorAll('main > section').forEach(section => {
        section.style.display = section.id === 'user-orders' ? 'block' : 'none';
    });

    const ordersList = document.getElementById('user-orders-list');
    if (!ordersList) {
        console.error('Error: #user-orders-list not found in DOM');
        return;
    }
    ordersList.innerHTML = '<p>Loading...</p>';

    try {
        const { data, error } = await window.supabase
            .from('orders')
            .select('*')
            .eq('userid', currentUser.id)
            .order('created_at', { ascending: false });
        if (error) throw error;
        ordersList.innerHTML = '';
        if (!data || data.length === 0) {
            ordersList.innerHTML = '<p>No orders found.</p>';
            return;
        }
        data.forEach(order => {
            const itemDiv = document.createElement('div');
            itemDiv.className = 'transaction-card';
            itemDiv.innerHTML = `
                <p><strong>Item Name:</strong> ${order.items.map(i => i.game + ' - ' + i.description).join(', ')}</p>
                <p><strong>Price:</strong> $${order.total}</p>
                <p><strong>Time & Date:</strong> ${new Date(order.created_at).toLocaleString()}</p>
                <p><strong>Status:</strong> <span class="status status-${order.status.toLowerCase().replace(' ', '-')}">${order.status}</span></p>
            `;
            ordersList.appendChild(itemDiv);
        });
    } catch (error) {
        console.error('Error loading orders:', error);
        ordersList.innerHTML = `<p>Error loading orders: ${error.message}</p>`;
    }

    history.pushState({ page: 'user-orders' }, 'User Orders', '/user-orders');
}

async function loadRedeemPoints() {
    const userPointsSpan = document.getElementById('user-points');
    if (!currentUser) {
        history.pushState({ page: 'login-page' }, 'Login', '/login-page');
        showPage('login-page');
        return;
    }

    await checkSuspensionStatus(); // Add this
    if (!currentUser) return; // Exit if suspended

    document.querySelector('header').style.display = 'none';
    document.querySelector('.top-nav').style.display = 'none';
    showPage('redeem-points');

    try {
        const { data, error } = await window.supabase
            .from('users')
            .select('points')
            .eq('id', currentUser.id)
            .single();
        if (error) throw error;
        userPoints = data.points || 0;
        userPointsSpan.textContent = userPoints;
    } catch (error) {
        console.error('Error loading points:', error);
        showNotification('Error loading points: ' + error.message);
    }
}

window.addEventListener('scroll', toggleReviewSliderVisibility)

function showReviewPage() {
    if (!currentOrder || !currentOrder.orderid) {
        history.pushState({ page: 'game-selection' }, 'Game Selection', '/');
        showPage('game-selection');
        return;
    }
    history.pushState({ page: 'review-page' }, 'Review', '/review-page');
    document.querySelectorAll('main > section').forEach(section => section.style.display = 'none');
    const reviewPage = document.getElementById('review-page');
    if (reviewPage) {
        reviewPage.style.display = 'block';
        const nav = document.querySelector('.top-nav');
        if (nav) nav.style.display = 'none';

        attachStarRatingListeners('review-page-rating');

        // Set default review text
        const textEl = document.getElementById('review-page-text');
        if (textEl) {
            textEl.value = "Great service, fast delivery!"; // Default positive comment
        }

        const submitBtn = document.getElementById('submit-review-page');
        console.log('Submit button found:', submitBtn);
        if (submitBtn) {
            const submitReviewHandler = async function() {
                const ratingEl = document.getElementById('review-page-rating-value');
                const textEl = document.getElementById('review-page-text');
                const rating = ratingEl?.value || 0;
                const text = textEl?.value.trim() || '';
                console.log('Submit clicked - ratingEl:', ratingEl, 'textEl:', textEl);
                console.log('Rating:', rating, 'Text:', text);

                if (!text) {
                    showNotification('Please write a review before submitting.');
                    return;
                }
                if (parseInt(rating) === 0) {
                    showNotification('Please select a star rating.');
                    return;
                }

                try {
                    const { data: orderData, error: orderError } = await window.supabase
                        .from('orders')
                        .select('*')
                        .eq('orderid', currentOrder.orderid)
                        .single();
                    if (orderError) throw orderError;
                    if (!orderData.reviewallowed) {
                        showNotification('Review already submitted for this order.');
                        return;
                    }

                    const username = orderData.userid || orderData.email.split('@')[0];
                    const review = {
                        orderid: currentOrder.orderid,
                        username: username,
                        rating: parseInt(rating),
                        text: text,
                        created_at: new Date().toISOString()
                    };

                    const { error: reviewError } = await window.supabase
                        .from('reviews')
                        .insert(review);
                    if (reviewError) throw reviewError;

                    const { error: updateError } = await window.supabase
                        .from('orders')
                        .update({ reviewallowed: false })
                        .eq('orderid', currentOrder.orderid);
                    if (updateError) throw updateError;

                    showNotification('Thank you for your review!');
                    currentOrder = null;
                    history.pushState({ page: 'game-selection' }, 'Game Selection', '#game-selection');
                    showPage('game-selection');
                } catch (error) {
                    console.error('Error submitting review:', error);
                    showNotification('Error submitting review: ' + error.message);
                }
            };

            submitBtn.addEventListener('click', submitReviewHandler);

            // Add Enter key listener for review page
            if (textEl) {
                textEl.addEventListener('keydown', function(e) {
                    if (e.key === 'Enter' && !e.shiftKey) { // Enter without Shift submits
                        e.preventDefault();
                        submitReviewHandler();
                    }
                });
            }
        }

        const skipBtn = document.getElementById('skip-review');
        if (skipBtn) {
            skipBtn.onclick = function() {
                currentOrder = null;
                history.pushState({ page: 'game-selection' }, 'Game Selection', '#game-selection');
                showPage('game-selection');
            };
        }
    }
}

async function checkMLBBUsername(userId, serverId) {
    try {
        const response = await fetch("https://ninja-flask-backend.onrender.com/check-smile/mobile-legends/" + userId + "/" + serverId);
        const result = await response.json();
        console.log("MLBB check for " + userId + "/" + serverId + ":", result);
        return result.username || "Invalid ID or Server";
    } catch (error) {
        console.error('Error checking MLBB username:', error);
        return 'Error checking ID';
    }
}

async function checkSmileOneUser(game, uid, serverId) {
    const proxyUrl = `https://ninja-flask-backend.onrender.com/check-smile/${game}/${uid}/${serverId}`;
    
    try {
        const response = await fetch(proxyUrl, {
            method: "GET",
            headers: {
                "Accept": "application/json"
            },
            signal: AbortSignal.timeout(5000)
        });

        if (!response.ok) {
            throw new Error(`Proxy error! Status: ${response.status}`);
        }

        const data = await response.json();
        if (data.status === "success") {
            if ((game === "mobile-legends" || game === "honkai-star-rail") && data.username) {
                return { nickname: data.username, error: null };
            } else if (game === "genshin-impact") {
                return { nickname: null, message: "Account Verified", error: null };
            }
            return { nickname: null, message: data.message || "UID and Server verified", error: null };
        }
        return { nickname: null, error: data.message || "Invalid UID or Server" };
    } catch (error) {
        console.error(`Error checking ${game} UID via Smile One proxy:`, error);
        return { nickname: null, error: "Error validating UID" };
    }
}

function debounceCheckSmileOneUser(game, delay = 500) {
    return debounce(async (uid, serverId, displayElement) => {
        if (!uid || !/^\d+$/.test(uid)) {
            displayElement.textContent = "Enter a valid UID";
            displayElement.style.color = "orange";
            return;
        }

        // Show "Validating..." for Genshin only
        if (game === "genshin-impact") {
            displayElement.textContent = "Validating...";
            displayElement.style.color = "orange";
        }

        const result = await checkSmileOneUser(game, uid, serverId);
        if (result.nickname) {
            displayElement.textContent = result.nickname;
            displayElement.style.color = "green";
        } else if (result.message && !result.error) {
            displayElement.textContent = result.message;
            displayElement.style.color = "green";
        } else {
            displayElement.textContent = result.error;
            displayElement.style.color = "red";
        }
    }, delay);
}

function showTopupForm(game, method = 'uid') {
    const section = document.getElementById('topup-form');
    if (!section) {
        console.error('Topup form section not found');
        return;
    }
    document.querySelectorAll('main > section').forEach(s => s.style.display = 'none');
    section.style.display = 'block';

    // Reset inputs
    const userId = document.getElementById('user-id');
    const amount = document.getElementById('amount');
    const serverGenshin = document.getElementById('server-genshin');
    const serverMlbb = document.getElementById('server-mlbb');
    const serverHsr = document.getElementById('server-hsr');
    const serverZzz = document.getElementById('server-zzz');
    const usernameDisplay = document.getElementById('mlbb-username-display');
    if (userId) userId.value = '';
    if (amount) amount.value = '';
    if (serverGenshin) serverGenshin.value = '';
    if (serverMlbb) serverMlbb.value = '';
    if (serverHsr) serverHsr.value = 'asia'; // Default value
    if (serverZzz) serverZzz.value = 'asia'; // Default value
    if (usernameDisplay) usernameDisplay.textContent = '';

    // Adjust form based on method
    const uidFields = section.querySelectorAll('.uid-specific');
    const loginFields = section.querySelectorAll('.login-specific');
    const giftFields = section.querySelectorAll('.gift-specific');
    uidFields.forEach(field => field.style.display = method === 'uid' ? 'block' : 'none');
    loginFields.forEach(field => field.style.display = method === 'login' ? 'block' : 'none');
    giftFields.forEach(field => field.style.display = method === 'gift' ? 'block' : 'none');

    // Add displays for HSR and ZZZ UID feedback
    let hsrUsernameDisplay = document.getElementById('hsr-username-display');
    if (!hsrUsernameDisplay && userId) {
        hsrUsernameDisplay = document.createElement('span');
        hsrUsernameDisplay.id = 'hsr-username-display';
        userId.parentNode.appendChild(hsrUsernameDisplay);
    }
    let zzzUsernameDisplay = document.getElementById('zzz-username-display');
    if (!zzzUsernameDisplay && userId) {
        zzzUsernameDisplay = document.createElement('span');
        zzzUsernameDisplay.id = 'zzz-username-display';
        userId.parentNode.appendChild(zzzUsernameDisplay);
    }

    // Remove previous event listeners to prevent stacking
    const newUserId = userId.cloneNode(true);
    userId.parentNode.replaceChild(newUserId, userId);

    const baseUrl = '/images/';
    const fallbackBanner = `${baseUrl}default-banner.jpg`;
    const fallbackDetails = `${baseUrl}default-details.jpg`;
    
    const gameDetails = {
        'mobile-legends': { banner: `${baseUrl}mobile-legends-banner.jpg`, info: 'A popular 5v5 MOBA game with epic battles.', details: `${baseUrl}mobile-legends-details.jpg` },
        'mobile-legends-sg': { banner: `${baseUrl}mobile-legends-banner.jpg`, info: 'A popular 5v5 MOBA game with epic battles (SG).', details: `${baseUrl}mobile-legends-details.jpg` },
        'genshin-impact': { banner: `${baseUrl}genshin-impact-banner.jpg`, info: 'An open-world RPG with elemental combat.', details: `${baseUrl}genshin-impact-details.jpg` },
        'pubg-mobile': { banner: `${baseUrl}pubg-mobile-banner.jpg`, info: 'Battle royale survival on mobile.', details: `${baseUrl}pubg-mobile-details.jpg` },
        'identity-v': { banner: `${baseUrl}identity-v-banner.jpg`, info: 'A 1v4 asymmetrical horror game.', details: `${baseUrl}identity-v-details.jpg` },
        'bloodstrike': { banner: `${baseUrl}bloodstrike-banner.jpg`, info: 'Fast-paced battle royale action.', details: `${baseUrl}bloodstrike-details.jpg` },
        'honor-of-kings': { banner: `${baseUrl}honor-of-kings-banner.jpg`, info: 'A leading MOBA with rich lore.', details: `${baseUrl}honor-of-kings-details.jpg` },
        'arena-breakout': { banner: `${baseUrl}arena-breakout-banner.jpg`, info: 'Tactical FPS extraction shooter.', details: `${baseUrl}arena-breakout-details.jpg` },
        'marvel-rivals': { banner: `${baseUrl}marvel-rivals-banner.jpg`, info: 'Superhero team-based shooter.', details: `${baseUrl}marvel-rivals-details.jpg` },
        'love-and-deepspace': { banner: `${baseUrl}love-and-deepspace-banner.jpg`, info: 'Romantic sci-fi otome game.', details: `${baseUrl}love-and-deepspace-details.jpg` },
        'marvel-snap': { banner: `${baseUrl}marvel-snap-banner.jpg`, info: 'Fast-paced card battler.', details: `${baseUrl}marvel-snap-details.jpg` },
        'zenless-zone-zero': { banner: `${baseUrl}zenless-zone-zero-banner.jpg`, info: 'Urban fantasy action RPG.', details: `${baseUrl}zenless-zone-zero-details.jpg` },
        'honkai-star-rail': { banner: `${baseUrl}honkai-star-rail-banner.jpg`, info: 'Space fantasy turn-based RPG.', details: `${baseUrl}honkai-star-rail-details.jpg` }
    };
    const selectedGame = gameDetails[game] || { banner: fallbackBanner, info: 'Game details not available.', details: fallbackDetails };
    const loggedErrors = new Set();

    const gameBanner = document.getElementById('game-banner');
    if (gameBanner) {
        gameBanner.src = selectedGame.banner;
        gameBanner.style.display = 'block';
        gameBanner.onerror = () => {
            if (!loggedErrors.has(`banner-${game}`)) {
                console.error(`Failed to load banner for ${game}`);
                loggedErrors.add(`banner-${game}`);
            }
            gameBanner.src = fallbackBanner;
        };
    } else {
        console.error('Game banner element not found in DOM');
    }
    const gameDetailsScreenshot = document.getElementById('game-details-screenshot');
    if (gameDetailsScreenshot) {
        gameDetailsScreenshot.src = selectedGame.details;
        gameDetailsScreenshot.onerror = () => {
            if (!loggedErrors.has(`screenshot-${game}`)) {
                console.error(`Failed to load screenshot for ${game}`);
                loggedErrors.add(`screenshot-${game}`);
            }
            gameDetailsScreenshot.src = fallbackDetails;
        };
    }

    // Show/hide server inputs
    const genshinServer = document.getElementById('genshin-server');
    const mlbbServer = document.getElementById('mlbb-server');
    const hsrServer = document.getElementById('hsr-server');
    const zzzServer = document.getElementById('zzz-server');
    if (genshinServer) genshinServer.style.display = game === 'genshin-impact' ? 'block' : 'none';
    if (mlbbServer) mlbbServer.style.display = (game === 'mobile-legends' || game === 'mobile-legends-sg') ? 'block' : 'none';
    if (hsrServer) hsrServer.style.display = game === 'honkai-star-rail' ? 'block' : 'none';
    if (zzzServer) zzzServer.style.display = game === 'zenless-zone-zero' ? 'block' : 'none';

    // Amount options (assuming gameOptions is defined in gameOptions.js)
    const amountOptionsContainer = document.getElementById('amount-options');
    if (amountOptionsContainer) {
        amountOptionsContainer.innerHTML = '';
        const options = gameOptions[game];
        if (!options || !Array.isArray(options)) {
            console.error(`No valid options found for game: ${game}`);
            amountOptionsContainer.innerHTML = '<p>No top-up options available for this game.</p>';
            return;
        }

        const optionsContainer = document.createElement('div');
        optionsContainer.className = 'amount-options';
        options.forEach(opt => {
            if (!opt || !opt.text || !opt.value || typeof opt.price === 'undefined') {
                console.warn(`Invalid option for ${game}:`, opt);
                return;
            }
            const optionDiv = document.createElement('div');
            optionDiv.className = 'amount-option';
            const textSpan = document.createElement('span');
            textSpan.className = 'text';
            textSpan.textContent = opt.text.replace(/ - S?\$\d+\.\d{2}$/, '');
            const priceSpan = document.createElement('span');
            priceSpan.className = 'price';
            const priceMatch = opt.text.match(/S?\$\d+\.\d{2}$/);
            priceSpan.textContent = priceMatch ? priceMatch[0] : `S$${opt.price.toFixed(2)}`;
            optionDiv.appendChild(textSpan);
            optionDiv.appendChild(priceSpan);
            optionDiv.dataset.value = opt.value;
            optionDiv.dataset.price = opt.price;
            optionDiv.addEventListener('click', function() {
                document.querySelectorAll('#amount-options .amount-option').forEach(o => o.classList.remove('selected'));
                this.classList.add('selected');
                const amountInput = document.getElementById('amount');
                if (amountInput) amountInput.value = this.dataset.value;
            });
            optionsContainer.appendChild(optionDiv);
        });
        amountOptionsContainer.appendChild(optionsContainer);
    }

    if (game === 'honkai-star-rail') {
        const hsrOptions = document.getElementById('server-hsr-options');
        const serverHsr = document.getElementById('server-hsr');
        const hsrUsernameDisplay = document.getElementById('hsr-username-display');
        const checkHSR = debounceCheckSmileOneUser("honkai-star-rail");
    
        if (hsrOptions) {
            hsrOptions.querySelectorAll('.server-option').forEach(option => {
                option.addEventListener('click', function() {
                    hsrOptions.querySelectorAll('.server-option').forEach(o => o.classList.remove('selected'));
                    this.classList.add('selected');
                    const serverMap = {
                        "asia": "prod_official_asia",
                        "america": "prod_official_usa",
                        "europe": "prod_official_eur",
                        "tw-hk-mo": "prod_official_cht"
                    };
                    serverHsr.value = serverMap[this.dataset.value] || "prod_official_asia";
                    hsrUsernameDisplay.textContent = "Verifying..."; // Show immediately on server change
                    hsrUsernameDisplay.style.color = "orange";
                    checkHSR(newUserId.value, serverHsr.value, hsrUsernameDisplay);
                });
            });
        }
        newUserId.addEventListener('input', () => {
            hsrUsernameDisplay.textContent = "Verifying..."; // Show on input
            hsrUsernameDisplay.style.color = "orange";
            checkHSR(newUserId.value, serverHsr.value, hsrUsernameDisplay);
        });
    }
    
    if (game === 'genshin-impact') {
        const genshinOptions = document.getElementById('server-genshin-options');
        const serverGenshin = document.getElementById('server-genshin');
        const genshinUsernameDisplay = document.getElementById('genshin-username-display') || (function() {
            const span = document.createElement('span');
            span.id = 'genshin-username-display';
            newUserId.parentNode.appendChild(span);
            return span;
        })();
        const checkGenshin = debounceCheckSmileOneUser("genshin-impact");
    
        if (genshinOptions) {
            genshinOptions.querySelectorAll('.server-option').forEach(function(option) {
                option.addEventListener('click', function() {
                    genshinOptions.querySelectorAll('.server-option').forEach(function(o) {
                        o.classList.remove('selected');
                    });
                    this.classList.add('selected');
                    const serverMap = {
                        "Asia": "os_asia",
                        "America": "os_usa",
                        "Europe": "os_euro",
                        "TW, HK, MO": "os_cht"
                    };
                    serverGenshin.value = serverMap[this.dataset.value] || "os_asia";
                    genshinUsernameDisplay.textContent = "Verifying..."; // Show on server change
                    genshinUsernameDisplay.style.color = "orange";
                    checkGenshin(newUserId.value, serverGenshin.value, genshinUsernameDisplay);
                });
            });
        }
        newUserId.addEventListener('input', function() {
            genshinUsernameDisplay.textContent = "Verifying..."; // Show on input
            genshinUsernameDisplay.style.color = "orange";
            checkGenshin(newUserId.value, serverGenshin.value, genshinUsernameDisplay);
        });
    }
    
    if (game === 'mobile-legends' || game === 'mobile-legends-sg') {
        const checkMLBB = debounceCheckSmileOneUser("mobile-legends");
        newUserId.addEventListener('input', function() {
            usernameDisplay.textContent = "Verifying..."; // Show on UID input
            usernameDisplay.style.color = "orange";
            checkMLBB(newUserId.value, serverMlbb.value, usernameDisplay);
        });
        serverMlbb.addEventListener('input', function() {
            usernameDisplay.textContent = "Verifying..."; // Show on server input
            usernameDisplay.style.color = "orange";
            checkMLBB(newUserId.value, serverMlbb.value, usernameDisplay);
        });
    }

    updateCurrencyName(game);
}

function showPage(page, game = null) {
    const pages = document.querySelectorAll('main > section');
    pages.forEach(section => {
        section.style.display = section.id === page ? 'block' : 'none';
    });
    const header = document.querySelector('header');
    const nav = document.querySelector('.top-nav');
    if (header) header.style.display = 'block';
    if (nav) nav.style.display = 'flex';
    if (page === 'game-selection') {
        showSlides(slideIndex);
    } else if (page === 'topup-form' && game) {
        showTopupForm(game);
    } else if (page === 'cart') {
        showCart();
    } else if (page === 'checkout') {
        showCheckout();
    } else if (page === 'order-confirmation') {
        document.getElementById('confirmation-overlay').style.display = 'block';
    } else if (page === 'thank-you') {
        showThankYouPage();
    } else if (page === 'past-transactions') {
        showPastTransactions();
    } else if (page === 'user-orders') {
        if (!currentUser) {
            showNotification('Please log in to view your orders.');
            history.pushState({ page: 'login-page' }, 'Login', '/login-page');
            showPage('login-page');
        } else {
            loadUserOrders();
        }
    } else if (page === 'user-profile') {
        if (!currentUser) {
            showNotification('Please log in to view your profile.');
            history.pushState({ page: 'login-page' }, 'Login', '/login-page');
            showPage('login-page');
        } else {
            loadUserProfile();
        }
    } else if (page === 'login-page') {
        reattachLoginListeners();
    }
}

function reattachLoginListeners() {
    const googleLoginBtn = document.getElementById('google-login-btn');
    if (googleLoginBtn) {
        console.log('Reattaching listener to Google login button');
        googleLoginBtn.removeEventListener('click', googleLoginBtn.clickHandler);
        const redirectTo = 'https://doctopup.netlify.app/#auth-callback';
        let isLoggingIn = false;
        googleLoginBtn.clickHandler = async () => {
            if (isLoggingIn) {
                console.log('Login already in progress, ignoring click');
                return;
            }
            isLoggingIn = true;
            console.log('Google login button clicked - Event triggered');
            try {
                console.log('Attempting Google login with redirectTo:', redirectTo);
                const { data, error } = await window.supabase.auth.signInWithOAuth({
                    provider: 'google',
                    options: {
                        redirectTo: redirectTo,
                        scopes: 'email profile'
                    }
                });
                if (error) {
                    console.error('Google login error:', error.message, error);
                    showNotification('Google Login Error: ' + error.message);
                    throw error;
                }
                console.log('Google login initiated, data:', data);
                if (!data.url) {
                    showNotification('Popup blocked. Please allow popups and try again.');
                }
            } catch (error) {
                console.error('Caught error:', error.message);
                showNotification('Error: ' + error.message);
            } finally {
                isLoggingIn = false;
            }
        };
        googleLoginBtn.addEventListener('click', googleLoginBtn.clickHandler);
        googleLoginBtn.addEventListener('mouseover', () => {
            console.log('Mouse over Google login button - Cursor should change');
        });
    }
}

function getCurrencyName(game) {
  if (game.includes('mobile-legends')) return 'Diamonds';
  if (game === 'genshin-impact') return 'Genesis Crystals';
  if (game === 'pubg-mobile') return 'UC';
  if (game === 'identity-v') return 'Clues';
  if (game === 'bloodstrike') return 'Credits';
  if (game === 'honor-of-kings') return 'Tokens';
  if (game === 'arena-breakout') return 'Tokens';
  if (game === 'marvel-rivals') return 'Lattice';
  if (game === 'love-and-deepspace') return 'Diamonds';
  if (game === 'marvel-snap') return 'Credits';
  if (game === 'zenless-zone-zero') return 'Monochromes';
  if (game === 'honkai-star-rail') return 'Oneiric Shards';
  if (game === 'valorant-global') return 'Valorant Points';
  if (game === 'valorant-sg') return 'Valorant Points';
  if (game === 'brawl-stars') return 'Gems';
  if (game === 'clash-of-clans') return 'Gems';
  if (game === 'clash-royale') return 'Gems';
  if (game === 'pokemon-tcg-pocket') return 'Packs';
  if (game === 'pokemon-unite') return 'Aeos Coins';
  if (game === 'wuthering-waves') return 'Radiant Tides';
  if (game === 'fc-mobile-sg') return 'FIFA Points';
  return 'Units';
}

function showCart() {
  const cartSection = document.getElementById('cart');
  if (!cartSection) return;
  document.querySelectorAll('main > section').forEach(section => section.style.display = 'none');
  cartSection.style.display = 'block';
  const cartItems = document.getElementById('cart-items');
  if (cartItems) {
      cartItems.innerHTML = cart.length === 0 ? '<p>Your cart is empty.</p>' : '';
      cart.forEach((item, index) => {
          const itemDiv = document.createElement('div');
          itemDiv.className = 'cart-item';
          itemDiv.innerHTML = `
              <p><strong>${item.game}</strong>: ${item.description}</p>
              <p>User ID: ${item.userId}${item.server ? ', Server: ' + item.server : ''}</p>
              <p>Price: $${item.price.toFixed(2)}</p>
              <button onclick="removeFromCart(${index})">Remove</button>
          `;
          cartItems.appendChild(itemDiv);
      });
      const checkoutBtn = document.getElementById('checkout-btn');
      if (checkoutBtn) checkoutBtn.disabled = cart.length === 0;
  }
}

function removeFromCart(index) {
  cart.splice(index, 1);
  updateCart();
  showCart();
}

function updateCart() {
  const cartCount = document.getElementById('cart-count');
  if (cartCount) {
      cartCount.textContent = cart.length;
      cartCount.classList.add('cart-count-updated');
      setTimeout(() => cartCount.classList.remove('cart-count-updated'), 200);
  }
  localStorage.setItem('ninjaCart', JSON.stringify(cart));
}

function showCheckout() {
    const checkoutSection = document.getElementById('checkout');
    if (!checkoutSection) return;

    (async () => {
        if (currentUser) {
            await checkSuspensionStatus();
            if (!currentUser) showNotification('Your account is suspended. You can continue as a guest.');
        }

        document.querySelectorAll('main > section').forEach(section => section.style.display = 'none');
        checkoutSection.style.display = 'block';

        const checkoutItemsDiv = document.getElementById('checkout-items');
        if (checkoutItemsDiv) {
            checkoutItemsDiv.innerHTML = '';
            let total = 0;
            cart.forEach(item => {
                const itemDiv = document.createElement('div');
                itemDiv.className = 'checkout-item';
                itemDiv.innerHTML = `
                    <p><strong>${item.game}</strong>: ${item.description}</p>
                    <p>User ID: <input type="text" class="checkout-userid" value="${item.userId || ''}" placeholder="Player ID">
                       Server: <input type="text" class="checkout-server" value="${item.server || ''}" placeholder="Server ID">
                       <span class="username-display" data-game="${item.game}"></span></p>
                    <p>Price: $${item.price.toFixed(2)}</p>
                `;
                checkoutItemsDiv.appendChild(itemDiv);
                total += item.price;
            });
            const totalAmount = document.getElementById('total-amount');
            if (totalAmount) totalAmount.textContent = appliedVoucher ? 
                `$${(total - total * appliedVoucher.discount).toFixed(2)} (Voucher: ${appliedVoucher.code})` : 
                `$${total.toFixed(2)}`;
        }

        attachIdCheckListeners(); // Add this to attach the listeners
    })();
}

// Debounce function to limit API calls
function debounce(func, wait) {
    let timeout;
    return function (...args) {
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(this, args), wait);
    };
}

async function checkSmileOneUser(game, uid, serverId) {
    const proxyUrl = `https://ninja-flask-backend.onrender.com/check-smile/${game}/${uid}/${serverId}`;
    
    try {
        const response = await fetch(proxyUrl, {
            method: "GET",
            headers: {
                "Accept": "application/json"
            },
            signal: AbortSignal.timeout(5000)
        });

        if (!response.ok) {
            throw new Error(`Proxy error! Status: ${response.status}`);
        }

        const data = await response.json();
        console.log(`API Response for ${game} (${uid}/${serverId}):`, data); // Debug log

        if (data.status === "success") {
            if ((game === "mobile-legends" || game === "honkai-star-rail") && data.username) {
                console.log(`Found username for ${game}: ${data.username}`);
                return { nickname: data.username, error: null };
            } else if (game === "genshin-impact") {
                return { nickname: null, message: "Account Verified", error: null };
            } else if (data.message) {
                return { nickname: null, message: data.message, error: null };
            }
            return { nickname: null, message: "UID and Server verified", error: null }; // Fallback
        }
        return { nickname: null, error: data.message || "Invalid UID or Server" };
    } catch (error) {
        console.error(`Error checking ${game} UID via Smile One proxy:`, error);
        return { nickname: null, error: "Error validating UID" };
    }
}

function debounceCheckSmileOneUser(game, delay = 500) {
    return debounce(async (uid, serverId, displayElement) => {
        if (!uid || !/^\d+$/.test(uid)) {
            displayElement.textContent = "Enter a valid UID";
            displayElement.style.color = "orange";
            return;
        }

        // Show "Verifying..." for all three games before fetch
        displayElement.textContent = "Verifying...";
        displayElement.style.color = "orange";

        const result = await checkSmileOneUser(game, uid, serverId);
        console.log(`Result for ${game} (${uid}/${serverId}):`, result); // Debug log

        if (result.nickname) {
            displayElement.textContent = result.nickname;
            displayElement.style.color = "green";
        } else if (result.message && !result.error) {
            displayElement.textContent = result.message;
            displayElement.style.color = "green";
        } else {
            displayElement.textContent = result.error;
            displayElement.style.color = "red";
        }
    }, delay);
}

async function checkSmileOneUser(game, uid, serverId) {
    const proxyUrl = `https://ninja-flask-backend.onrender.com/check-smile/${game}/${uid}/${serverId}`;
    
    try {
        const response = await fetch(proxyUrl, {
            method: "GET",
            headers: {
                "Accept": "application/json"
            },
            signal: AbortSignal.timeout(5000)
        });

        if (!response.ok) {
            throw new Error(`Proxy error! Status: ${response.status}`);
        }

        const data = await response.json();
        console.log(`API Response for ${game} (${uid}/${serverId}):`, data); // Debug log

        if (data.status === "success") {
            if (data.username && (game === "mobile-legends" || game === "honkai-star-rail")) {
                console.log(`Found username for ${game}: ${data.username}`);
                return { nickname: data.username, error: null };
            } else if (game === "genshin-impact") {
                return { nickname: null, message: "Account Verified", error: null };
            } else if (data.message) {
                return { nickname: null, message: data.message, error: null };
            }
            return { nickname: null, message: "UID and Server verified", error: null }; // Fallback
        }
        return { nickname: null, error: data.message || "Invalid UID or Server" };
    } catch (error) {
        console.error(`Error checking ${game} UID via Smile One proxy:`, error);
        return { nickname: null, error: "Error validating UID" };
    }
}

function attachIdCheckListeners() {
    const userIdInputs = document.querySelectorAll('.checkout-userid');
    const serverInputs = document.querySelectorAll('.checkout-server');

    const checkName = debounce(async function(userIdInput, serverInput, displayEl) {
        const userId = userIdInput.value.trim();
        const serverId = serverInput.value.trim();
        const game = displayEl.dataset.game.toLowerCase();

        if (userId && serverId && (game === "mobile-legends" || game === "mobile-legends-sg")) {
            const result = await checkSmileOneUser("mobile-legends", userId, serverId);
            if (result.nickname) {
                displayEl.textContent = "Username: " + result.nickname;
                displayEl.style.color = "#000";
            } else {
                displayEl.textContent = result.error || "Invalid ID or Server";
                displayEl.style.color = "#f00";
            }
        } else if (userId && serverId && game === "genshin-impact") {
            const result = await checkSmileOneUser("genshin-impact", userId, serverId);
            if (result.message && !result.error) {
                displayEl.textContent = result.message;
                displayEl.style.color = "#000";
            } else {
                displayEl.textContent = result.error || "Invalid UID or Server";
                displayEl.style.color = "#f00";
            }
        } else {
            displayEl.textContent = "";
        }
    }, 500);

    userIdInputs.forEach(function(userIdInput, index) {
        const serverInput = serverInputs[index];
        const displayEl = userIdInput.parentElement.querySelector('.username-display');
        userIdInput.addEventListener('input', function() {
            checkName(userIdInput, serverInput, displayEl);
        });
        serverInput.addEventListener('input', function() {
            checkName(userIdInput, serverInput, displayEl);
        });
    });
}

function hideCheckout() {
    const checkoutSection = document.getElementById('checkout');
    if (checkoutSection) {
        checkoutSection.style.display = 'none';
    } else {
        console.warn('Checkout section not found in DOM');
    }
}

function showConfirmation(order) {
    const confirmationSection = document.getElementById('order-confirmation');
    const confirmationContent = document.getElementById('confirmation-content');
    const trackingNumber = document.getElementById('tracking-number');
    if (!confirmationSection || !confirmationContent || !trackingNumber) {
        console.error('Confirmation elements not found in DOM');
        return;
    }

    // Populate existing fields
    trackingNumber.textContent = order.orderid;
    confirmationContent.querySelector('#item-name').textContent = order.items.map(i => `${i.game} - ${i.description}`).join(', ');
    confirmationContent.querySelector('#order-datetime').textContent = new Date(order.created_at).toLocaleString();
    confirmationContent.querySelector('#buyer-details').textContent = `Email: ${order.email}, Phone: ${order.phone}`;
    confirmationContent.querySelector('#game-credentials').textContent = order.items.map(i => `User ID: ${i.userId}${i.server ? ', Server: ' + i.server : ''}`).join(', ');
    
    // Update WhatsApp/Telegram links with pre-filled message
    const message = encodeURIComponent(`Order: ${order.orderid}, ${order.items.map(i => `${i.game} - ${i.amount} ${getCurrencyName(i.game)}`).join(', ')}`);
    document.getElementById('whatsapp-link').href = `https://wa.me/6584603731?text=${message}`;
    document.getElementById('telegram-link').href = `https://t.me/maitopup?text=${message}`;

    // Show the section and overlay
    confirmationSection.style.display = 'block';
    document.getElementById('confirmation-overlay').style.display = 'block';
}

function showThankYouPage() {
    history.pushState({ page: 'thank-you' }, 'Thank You', '/thank-you');
  document.querySelectorAll('main > section').forEach(section => section.style.display = 'none');
  const thankYouSection = document.getElementById('thank-you');
  if (!thankYouSection) return;
  thankYouSection.style.display = 'block';

  let countdown = 3;
  const countdownEl = document.getElementById('countdown');
  if (countdownEl) countdownEl.textContent = countdown;

  const interval = setInterval(() => {
      countdown--;
      if (countdownEl) countdownEl.textContent = countdown;
      if (countdown <= 0) {
          clearInterval(interval);
          resetPage();
      }
  }, 1000);
}

function showBankingDetails() {
  const bankingDetails = document.getElementById('banking-details');
  const overlay = document.getElementById('banking-details-overlay');
  if (bankingDetails && overlay) {
      bankingDetails.style.display = 'block';
      overlay.style.display = 'block';
  }
}

function hideBankingDetails() {
  const bankingDetails = document.getElementById('banking-details');
  const overlay = document.getElementById('banking-details-overlay');
  if (bankingDetails && overlay) {
      bankingDetails.style.display = 'none';
      overlay.style.display = 'none';
  }
}

async function showPastTransactions(page = 0) {
    history.pushState({ page: 'past-transactions' }, 'Past Transactions', '/past-transactions');
    document.querySelectorAll('main > section').forEach(section => section.style.display = 'none');
    const pastTransactionsSection = document.getElementById('past-transactions');
    if (!pastTransactionsSection) return;
    pastTransactionsSection.style.display = 'block';
    const pastTransactionsList = document.getElementById('past-transactions-list');
    if (!pastTransactionsList) return;
    pastTransactionsList.innerHTML = '<p>Loading...</p>';

    const itemsPerPage = 20;
    try {
        const { data, error } = await window.supabase
            .from('orders')
            .select('*')
            .order('created_at', { ascending: false })
            .range(page * itemsPerPage, (page + 1) * itemsPerPage - 1);
        if (error) throw error;
        pastTransactionsList.innerHTML = '';
        if (!data || data.length === 0) {
            pastTransactionsList.innerHTML = '<p>No transactions yet.</p>';
        } else {
            data.forEach(item => {
                const itemDiv = document.createElement('div');
                itemDiv.className = 'transaction-card';
                const status = item.status;
                const statusStyles = status === 'Delivered Successfully' 
                    ? 'background-color: #25D366; color: #ffffff;' 
                    : status === 'Processing' 
                    ? 'background-color: #FFC107; color: #000000;' 
                    : status === 'Refunded' 
                    ? 'background-color: #FF5722; color: #ffffff;' 
                    : 'background-color: #FF9800; color: #000000;';
                itemDiv.innerHTML = `
                    <div class="transaction-item">
                        <span class="item-name">${item.items[0].game} - ${item.items[0].amount} ${getCurrencyName(item.items[0].game)}</span>
                        <span class="status" style="${statusStyles}">${status}</span>
                    </div>
                `;
                pastTransactionsList.appendChild(itemDiv);
            });
            // Add "Load More" button if there are more items
            if (data.length === itemsPerPage) {
                const loadMoreBtn = document.createElement('button');
                loadMoreBtn.textContent = 'Load More';
                loadMoreBtn.addEventListener('click', () => showPastTransactions(page + 1));
                pastTransactionsList.appendChild(loadMoreBtn);
            }
        }
    } catch (error) {
        console.error('Error loading past transactions:', error);
        pastTransactionsList.innerHTML = `<p>Error loading transactions: ${error.message}</p>`;
    }

    const searchInput = document.getElementById('transaction-search');
    if (searchInput) {
        searchInput.addEventListener('input', function() {
            const query = this.value.toLowerCase();
            document.querySelectorAll('.transaction-card').forEach(card => {
                const itemName = card.querySelector('.item-name').textContent.toLowerCase();
                card.style.display = itemName.includes(query) ? 'flex' : 'none';
            });
        });
    }
}

async function loadUserData(uid) {
    try {
        const { data, error } = await window.supabase
            .from('users')
            .select('*')
            .eq('id', uid)
            .single();
        if (error && error.code !== 'PGRST116') throw error; // PGRST116 = no rows
        if (data) {
            userPoints = data.points || 0;
            document.getElementById('user-points').textContent = userPoints;
        } else {
            const { error: insertError } = await window.supabase
                .from('users')
                .insert({
                    id: uid,
                    email: currentUser.email,
                    whatsapp: '',
                    points: 0,
                    created_at: new Date().toISOString()
                });
            if (insertError) throw insertError;
            userPoints = 0;
            document.getElementById('user-points').textContent = userPoints;
        }
    } catch (error) {
        console.error('Error loading user data:', error);
        showNotification('Error loading points: ' + error.message);
    }
}

function attachNavListeners() {
    const navLinks = document.querySelectorAll('.top-nav > ul > li > a, .dropdown-content a');
    console.log('Found', navLinks.length, 'nav links including dropdowns');
    navLinks.forEach((link, index) => {
        link.removeEventListener('click', link.clickHandler);
        link.clickHandler = function(e) {
            e.preventDefault();
            const page = this.getAttribute('href').slice(1);
            const method = this.getAttribute('data-method');
            console.log(`Nav link #${index} clicked:`, page, 'Method:', method);
            if (method) {
                let internalMethod;
                if (method === 'uid-topup') internalMethod = 'uid';
                else if (method === 'login-topup') internalMethod = 'login';
                else if (method === 'gift-cards') internalMethod = 'gift';
                window.currentMethod = internalMethod;
                history.pushState({ page: 'game-selection', method: internalMethod }, 'Game Selection', '/product');
                showPage('game-selection');
                filterGameCards(internalMethod);
                const gameSection = document.getElementById('game-selection');
                if (gameSection) gameSection.scrollIntoView({ behavior: 'smooth' });
                // Close dropdown temporarily, then allow hover to reopen
                const dropdown = this.closest('.dropdown');
                if (dropdown) {
                    const dropdownContent = dropdown.querySelector('.dropdown-content');
                    if (dropdownContent) {
                        dropdownContent.style.display = 'none';
                        // Reset inline style after a short delay to restore hover functionality
                        setTimeout(() => {
                            dropdownContent.style.display = '';
                        }, 200); // 200ms delay
                    }
                }
            } else if (page === 'game-selection') {
                window.currentMethod = null;
                history.pushState({ page: 'game-selection' }, 'Game Selection', '/product');
                showPage('game-selection');
                filterGameCards('all');
                const gameSection = document.getElementById('game-selection');
                if (gameSection) gameSection.scrollIntoView({ behavior: 'smooth' });
            }
        };
        link.addEventListener('click', link.clickHandler);
    });
}

function showNotification(message) {
    const notification = document.getElementById('notification');
    const overlay = document.getElementById('notification-overlay');
    if (!notification || !overlay) return;
    notification.textContent = message;
    notification.style.display = 'block';
    overlay.style.display = 'block';
    notification.classList.add('show');
    setTimeout(() => {
        notification.classList.remove('show');
        setTimeout(() => {
            notification.style.display = 'none';
            overlay.style.display = 'none';
        }, 500);
    }, 3000);
}

function showCartNotification(message) {
    const bar = document.getElementById('cart-notification-bar');
    const text = document.getElementById('cart-notification-text');
    const progress = document.getElementById('cart-notification-progress');

    if (!bar || !text || !progress) {
        console.warn('Missing elements for cart notification:', { bar, text, progress });
        return;
    }
    
    text.textContent = message;
    bar.style.display = 'block';
    progress.style.transform = 'scaleX(0)'; // Reset progress
    setTimeout(() => {
        progress.style.transform = 'scaleX(1)'; // Start animation
    }, 10);
    
    setTimeout(() => {
        bar.style.display = 'none';
    }, 3000); // Hide after 3s
}

function hideNotification() {
  const notification = document.getElementById('notification');
  const overlay = document.getElementById('notification-overlay');
  if (!notification || !overlay) return;
  notification.classList.remove('show');
  setTimeout(() => {
      notification.style.display = 'none';
      overlay.style.display = 'none';
  }, 500);
}

function hideConfirmation() {
    const orderConfirmation = document.getElementById('order-confirmation');
    const confirmationOverlay = document.getElementById('confirmation-overlay');
    if (orderConfirmation) orderConfirmation.style.display = 'none';
    if (confirmationOverlay) confirmationOverlay.style.display = 'none';
}

function resetPage() {
  console.log('Resetting page');
  showPage('game-selection');
}

function goBack() {
    history.pushState({ page: 'game-selection' }, 'Game Selection', '/');
    showPage('game-selection');
}

function attachGameCardListeners() {
    const gameCards = document.querySelectorAll('.game-card');
    console.log('Attempt 1 - Found', gameCards.length, 'game cards');
    gameCards.forEach((card, index) => {
        card.removeEventListener('click', card.clickHandler);
        card.clickHandler = function(e) {
            e.preventDefault(); // Added to prevent default behavior
            const game = this.getAttribute('data-game');
            const method = this.getAttribute('data-method') || 'uid'; // Fallback to 'uid'
            console.log(`Game card #${index} clicked: ${game}, Method: ${method}`);
            if (game) {
                showTopupForm(game, method);
                history.pushState({ page: 'topup-form', game, method }, `${game} Top-Up`, `/topup/${game}`);
            }
        };
        card.addEventListener('click', card.clickHandler);
    });
}

function attachFooterListeners() {
    document.querySelectorAll('footer a:not([href="/transaction-history"])').forEach(link => {
        link.addEventListener('click', function(e) {
            e.preventDefault();
            const page = this.getAttribute('href').slice(1); // Remove leading /
            console.log('Footer link clicked:', page);
            history.pushState({ page: page }, page.charAt(0).toUpperCase() + page.slice(1), `/${page}`);
            showPage(page);
        });
    });
}

function attachStarRatingListeners(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;
    const stars = container.querySelectorAll('span');
    let selectedRating = 0;

    stars.forEach((star, index) => {
        // Hover effect
        star.addEventListener('mouseover', () => {
            for (let i = 0; i < stars.length; i++) {
                stars[i].classList.toggle('hover', i <= index);
            }
        });
        star.addEventListener('mouseout', () => {
            for (let i = 0; i < stars.length; i++) {
                stars[i].classList.remove('hover');
                stars[i].classList.toggle('active', i < selectedRating);
            }
        });
        // Click effect
        star.addEventListener('click', () => {
            selectedRating = index + 1;
            for (let i = 0; i < stars.length; i++) {
                stars[i].classList.toggle('active', i < selectedRating);
            }
            document.getElementById(`${containerId}-value`).value = selectedRating;
        });
    });
}

async function showReviews() {
    history.pushState({ page: 'reviews' }, 'Reviews', '/reviews');
    document.querySelectorAll('main > section').forEach(section => section.style.display = 'none');
    const reviewsSection = document.getElementById('reviews');
    if (!reviewsSection) return;
    reviewsSection.style.display = 'block';
    const reviewsGrid = document.getElementById('reviews-grid');
    if (!reviewsGrid) return;
    reviewsGrid.innerHTML = '<p>Loading reviews...</p>';

    try {
        const { data, error } = await window.supabase
            .from('reviews')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(25); // Limit to 25 for a 5x5 grid
        if (error) throw error;

        reviewsGrid.innerHTML = '';
        if (!data || data.length === 0) {
            reviewsGrid.innerHTML = '<p>No reviews yet.</p>';
            return;
        }

        console.log('Fetched reviews:', data); // Debug log to confirm data
        data.forEach(review => {
            const reviewCard = document.createElement('div');
            reviewCard.className = 'review-card';
            reviewCard.innerHTML = `
                <div class="review-header">
                    <span class="review-username">${review.username || 'Anonymous'}</span>
                    <span class="review-date">${new Date(review.created_at).toLocaleDateString()}</span>
                </div>
                <div class="review-rating">${'★'.repeat(review.rating)}${'☆'.repeat(5 - review.rating)}</div>
                <p class="review-text">${review.text}</p>
            `;
            reviewsGrid.appendChild(reviewCard);
        });

        // Fill remaining slots if less than 25 reviews
        const emptySlots = 25 - data.length;
        for (let i = 0; i < emptySlots; i++) {
            const emptyCard = document.createElement('div');
            emptyCard.className = 'review-card empty';
            emptyCard.innerHTML = '<p>No review yet</p>';
            reviewsGrid.appendChild(emptyCard);
        }
    } catch (error) {
        console.error('Error loading reviews:', error);
        reviewsGrid.innerHTML = `<p>Error loading reviews: ${error.message}</p>`;
    }
}

function showReviewPrompt() {
  const reviewPrompt = document.getElementById('review-prompt');
  const overlay = document.getElementById('review-prompt-overlay');
  if (reviewPrompt && overlay) {
      reviewPrompt.style.display = 'block';
      overlay.style.display = 'block';
  }
}

function hideReviewPrompt() {
    const reviewPrompt = document.getElementById('review-prompt');
    const overlay = document.getElementById('review-prompt-overlay');
    if (reviewPrompt && overlay) {
        reviewPrompt.style.display = 'none';
        overlay.style.display = 'none';
        // Only reset currentOrder if explicitly intended here (e.g., after review submission elsewhere)
        history.pushState({ page: 'game-selection' }, 'Game Selection', '/');
    showPage('game-selection');
}
}

document.getElementById('close-confirmation')?.addEventListener('click', hideConfirmation);
document.getElementById('close-review-prompt')?.addEventListener('click', hideReviewPrompt);
document.getElementById('close-banking-details')?.addEventListener('click', hideBankingDetails);

document.querySelectorAll('#server-genshin-options .server-option').forEach(option => {
  option.addEventListener('click', function() {
      document.querySelectorAll('#server-genshin-options .server-option').forEach(o => o.classList.remove('selected'));
      this.classList.add('selected');
      document.getElementById('server-genshin').value = this.dataset.value;
  });
});

function plusSlides(n) {
  slideIndex += n;
  showSlides(slideIndex);
  console.log('Arrow clicked, showing slide:', slideIndex);
}

function showSlides(n) {
  const slides = document.getElementsByClassName("slide");
  const dots = document.getElementsByClassName("dot");
  if (slides.length === 0) return;
  if (n > slides.length) slideIndex = 1;
  if (n < 1) slideIndex = slides.length;
  for (let i = 0; i < slides.length; i++) {
      slides[i].style.display = "none";
      slides[i].classList.remove("fade");
  }
  for (let i = 0; i < dots.length; i++) {
      dots[i].classList.remove("active");
  }
  slides[slideIndex - 1].style.display = "block";
  slides[slideIndex - 1].classList.add("fade");
  dots[slideIndex - 1].classList.add("active");
  console.log('Showing slide:', slideIndex);
}

function currentSlide(n) {
  slideIndex = n;
  showSlides(slideIndex);
  console.log('Clicked dot, showing slide:', n);
}

function attachSlideListeners() {
    const slides = document.querySelectorAll('.slide');
    slides.forEach(slide => {
        slide.removeEventListener('click', slide.clickHandler); // Prevent duplicate listeners
        slide.clickHandler = function() {
            const game = this.getAttribute('data-game');
            console.log('Slide clicked:', game);
            history.pushState({ page: 'topup-form', game: game }, game.split('-').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' '), `/topup/${game}`);
            showTopupForm(game); // Direct call
        };
        slide.addEventListener('click', slide.clickHandler);
    });
}

function updateCurrencyName(game) {
  const currencyNameSpan = document.getElementById('currency-name');
  const topupLabel = document.querySelector("#topup-form label[for='amount']");
  const loginLabel = document.querySelector("#login-form label[for='login-amount']");
  const currency = getCurrencyName(game);
  if (currencyNameSpan) currencyNameSpan.textContent = currency;
  if (topupLabel) topupLabel.textContent = `Choose ${currency}:`;
  if (loginLabel) loginLabel.textContent = `Choose ${currency}:`;
}

function setInitialStars(containerId) {
  const container = document.getElementById(containerId);
  if (!container) return;
  const stars = container.querySelectorAll('span');
  for (let i = 0; i < 5; i++) {
      stars[i].classList.add('active');
  }
  document.getElementById(`${containerId}-value`).value = 5;
}

function toggleReviewSliderVisibility() {
  const slider = document.getElementById('review-slider');
  const footer = document.querySelector('footer');
  if (!slider || !footer) return;
  const footerTop = footer.getBoundingClientRect().top;
  const windowHeight = window.innerHeight;
  slider.style.display = (footerTop <= windowHeight && footerTop >= 0) ? 'block' : 'none';
}

const ninjaTitle = document.getElementById('ninja-title');
if (ninjaTitle) {
    ninjaTitle.addEventListener('click', function() {
        console.log('Title clicked, resetting page');
        history.pushState({ page: 'game-selection' }, 'Game Selection', '/');
        showPage('game-selection');
        filterGameCards('all');
    });
}

const cartIcon = document.getElementById('cart-icon');
if (cartIcon) {
    cartIcon.addEventListener('click', function() {
        console.log('Cart icon clicked');
        history.pushState({ page: 'cart' }, 'Cart', '/cart');
        showCart();
    });
}

const gameSearch = document.getElementById('game-search');
if (gameSearch) {
  gameSearch.addEventListener('input', function() {
      const query = this.value.toLowerCase();
      console.log('Search query:', query);
      document.querySelectorAll('.game-card').forEach(card => {
          const gameName = card.querySelector('span').textContent.toLowerCase();
          card.style.display = gameName.includes(query) ? 'flex' : 'none';
      });
  });
}

function initializePhonePrefixes() {
  const prefixInput = document.getElementById('checkout-phone-prefix');
  const phoneOptions = document.getElementById('phone-options');
  if (!prefixInput || !phoneOptions) return;
  phoneOptions.innerHTML = '';
  phonePrefixes.forEach(prefix => {
      const option = document.createElement('div');
      option.className = 'phone-option';
      option.textContent = `${prefix.code} (${prefix.name})`;
      option.dataset.code = prefix.code;
      option.dataset.name = prefix.name.toLowerCase();
      option.addEventListener('click', () => {
          prefixInput.value = prefix.code;
          phoneOptions.style.display = 'none';
      });
      phoneOptions.appendChild(option);
  });
  prefixInput.value = '+65';

  prefixInput.addEventListener('focus', () => {
      phoneOptions.style.display = 'block';
      filterPhoneOptions('');
  });

  prefixInput.addEventListener('input', function() {
      const query = this.value.toLowerCase();
      filterPhoneOptions(query);
  });

  document.addEventListener('click', (e) => {
      if (!prefixInput.contains(e.target) && !phoneOptions.contains(e.target)) {
          phoneOptions.style.display = 'none';
      }
  });

  function filterPhoneOptions(query) {
      document.querySelectorAll('.phone-option').forEach(option => {
          const code = option.dataset.code.toLowerCase();
          const name = option.dataset.name;
          option.style.display = (code.includes(query) || name.includes(query)) ? 'block' : 'none';
      });
  }
}

function filterGameCards(method) {
    console.log('Filtering game cards for method:', method);
    const gameGroups = document.querySelectorAll('.game-group');
    console.log('Found', gameGroups.length, 'game groups');
    gameGroups.forEach(group => {
        const groupCards = group.querySelectorAll('.game-card');
        const groupTitle = group.querySelector('h3').textContent.toLowerCase();
        console.log('Processing group:', groupTitle, 'with', groupCards.length, 'cards');
        let shouldShowGroup = false;
        groupCards.forEach(card => {
            const cardMethod = card.getAttribute('data-method')?.toLowerCase() || 'uid';
            console.log('Card:', card.getAttribute('data-game'), 'Method:', cardMethod);
            if (method === 'all') {
                card.style.display = 'flex';
                shouldShowGroup = true;
            } else if (method === 'uid' && cardMethod === 'uid') {
                card.style.display = 'flex';
                shouldShowGroup = true;
            } else if (method === 'login' && cardMethod === 'login') {
                card.style.display = 'flex';
                shouldShowGroup = true;
            } else if (method === 'gift' && cardMethod === 'gift') {
                card.style.display = 'flex';
                shouldShowGroup = true;
            } else {
                card.style.display = 'none';
            }
        });
        console.log('Group', groupTitle, 'shouldShowGroup:', shouldShowGroup);
        group.style.display = shouldShowGroup ? 'block' : 'none';
        group.classList.remove('active');
        if (shouldShowGroup && method !== 'all') {
            if (method === 'uid' && groupTitle.includes('direct uid top-up')) {
                group.classList.add('active');
                console.log('Marked active:', groupTitle);
            } else if (method === 'login' && groupTitle.includes('login top-up')) {
                group.classList.add('active');
                console.log('Marked active:', groupTitle);
            } else if (method === 'gift' && groupTitle.includes('gift card top-up')) {
                group.classList.add('active');
                console.log('Marked active:', groupTitle);
            }
        }
    });
    const slider = document.querySelector('.slideshow-container');
    if (slider) slider.style.display = method === 'all' ? 'block' : 'none';

    // Smooth scroll to the "Search Your Game" input with Apple-like easing
    const searchElement = document.getElementById('game-search');
    if (searchElement) {
        const start = window.scrollY;
        const target = searchElement.getBoundingClientRect().top + window.scrollY - 50; // Offset 50px above
        const duration = 1000; // 1 second for smooth scroll
        const startTime = performance.now();

        function ease(t) {
            // Apple-like ease-in-out (cubic-bezier approximation)
            return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
        }

        function scrollStep(currentTime) {
            const elapsed = currentTime - startTime;
            const progress = Math.min(elapsed / duration, 1);
            const easedProgress = ease(progress);
            window.scrollTo(0, start + (target - start) * easedProgress);

            if (progress < 1) {
                requestAnimationFrame(scrollStep);
            } else {
                console.log('Scrolled to Search Your Game');
            }
        }

        requestAnimationFrame(scrollStep);
    } else {
        console.warn('Search input (#game-search) not found for scrolling');
    }
}
