// Import required modules
const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const path = require('path');
const dotenv = require('dotenv');
const cookieParser = require('cookie-parser');
const multer = require('multer');
const upload = multer({ storage: multer.memoryStorage() });
// Load environment variables
dotenv.config();

// Initialize Express app
const app = express();
const PORT = process.env.PORT || 3000;

// Initialize Supabase client
const supabaseUrl = 'https://slixymwrmifwomrjqsbk.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNsaXh5bXdybWlmd29tcmpxc2JrIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0MTQ0OTQ1OSwiZXhwIjoyMDU3MDI1NDU5fQ.Kb1oTxZGzr9yP12ywwtS7JwVhop0u0UOq8BoHSl-jjc';
const supabase = createClient(supabaseUrl, supabaseKey);

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

// Set cookie with JWT token
const setAuthCookie = (res, token) => {
  res.cookie('authToken', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    sameSite: 'strict'
  });
};

// Login route
app.post('/api/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    
    // Validate input
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }
    
    // Authenticate with Supabase
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password
    });
    
    if (error) {
      return res.status(401).json({ error: error.message });
    }
    
    // Set auth cookie
    setAuthCookie(res, data.session.access_token);
    
    // Return success response
    return res.status(200).json({ 
      success: true, 
      redirectUrl: '/home',
      user: {
        id: data.user.id,
        email: data.user.email
      }
    });
  } catch (err) {
    console.error('Login error:', err);
    return res.status(500).json({ error: 'An error occurred during login' });
  }
});

// Signup route
app.post('/api/signup', async (req, res) => {
  try {
    const { name, email, password } = req.body;
    
    // Validate input
    if (!name || !email || !password) {
      return res.status(400).json({ error: 'Name, email, and password are required' });
    }
    
    // Create user in Supabase
    const { data: authData, error: authError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: name
        }
      }
    });
    
    if (authError) {
      return res.status(400).json({ error: authError.message });
    }
    
    // Add user to profiles table
    const { error: profileError } = await supabase
      .from('profiles')
      .insert({
        id: authData.user.id,
        full_name: name,
        email: email,
        created_at: new Date()
      });
    
    if (profileError) {
      console.error('Error creating profile:', profileError);
      // Don't return error to client here, since auth user was created successfully
    }
    
    // Set auth cookie
    if (authData.session) {
      setAuthCookie(res, authData.session.access_token);
    }
    
    // Return success response
    return res.status(200).json({ 
      success: true, 
      redirectUrl: '/home',
      user: {
        id: authData.user.id,
        email: authData.user.email
      }
    });
  } catch (err) {
    console.error('Signup error:', err);
    return res.status(500).json({ error: 'An error occurred during signup' });
  }
});

// Logout route
app.post('/api/logout', async (req, res) => {
  try {
    // Clear auth cookie
    res.clearCookie('authToken');
    
    // Sign out from Supabase
    const { error } = await supabase.auth.signOut();
    
    if (error) {
      return res.status(500).json({ error: error.message });
    }
    
    return res.status(200).json({ success: true, redirectUrl: '/' });
  } catch (err) {
    console.error('Logout error:', err);
    return res.status(500).json({ error: 'An error occurred during logout' });
  }
});

// Authentication middleware
const authenticateUser = async (req, res, next) => {
  const token = req.cookies.authToken;
  
  if (!token) {
    return res.redirect('/');
  }
  
  try {
    // Verify token with Supabase
    const { data, error } = await supabase.auth.getUser(token);
    
    if (error || !data.user) {
      res.clearCookie('authToken');
      return res.redirect('/');
    }
    
    req.user = data.user;
    next();
  } catch (err) {
    console.error('Auth error:', err);
    res.clearCookie('authToken');
    return res.redirect('/');
  }
};

// Protected route middleware
app.get('/home', authenticateUser, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index2.html'));
});

app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'painel.html'));
});




// Start the server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});


app.post('/recipes', authenticateUser, upload.single('image'), async (req, res) => {
  try {
    console.log('> Requisição recebida em /recipes');
    console.log('Body:', req.body);
    console.log('File:', req.file ? req.file.originalname : 'Nenhuma imagem enviada');

    const {
      title,
      category,
      meal_type,
      ingredients,
      instructions,
      prep_time,
      calories,
      published
    } = req.body;

    if (!title || !category || !meal_type || !ingredients || !instructions) {
      console.warn('Campos obrigatórios ausentes');
      return res.status(400).json({ message: 'Campos obrigatórios ausentes' });
    }

    let image_url = null;

    if (req.file) {
      const fileExt = path.extname(req.file.originalname);
      const fileName = `${Date.now()}-${Math.random().toString(36).substring(2)}${fileExt}`;
      const filePath = `recipes/${fileName}`;

      console.log(`> Iniciando upload para Supabase Storage: ${filePath}`);

      const { error: uploadError } = await supabase.storage
        .from('recipe-images')
        .upload(filePath, req.file.buffer, {
          contentType: req.file.mimetype,
          upsert: false
        });

      if (uploadError) {
        console.error('Erro ao fazer upload da imagem:', uploadError.message);
        throw uploadError;
      }

      const { data: publicUrlData } = supabase
        .storage
        .from('recipe-images')
        .getPublicUrl(filePath);

      image_url = publicUrlData.publicUrl;
      console.log(`> Upload concluído: ${image_url}`);
    }

    console.log('> Inserindo receita no banco de dados Supabase...');

    const { error } = await supabase
      .from('recipes')
      .insert([{
        title,
        category,
        meal_type,
        image_url,
        ingredients,
        instructions,
        prep_time: parseInt(prep_time) || 0,
        calories: parseInt(calories) || 0,
        published: published === 'true'
      }]);

    if (error) {
      console.error('Erro ao inserir receita no banco:', error.message);
      throw error;
    }

    console.log('> Receita salva com sucesso!');
    return res.status(201).json({ message: 'Receita criada com sucesso' });

  } catch (err) {
    console.error('Erro inesperado:', err.message);
    return res.status(500).json({ message: 'Erro ao salvar receita' });
  }
});


app.get('/recipes', authenticateUser, async (req, res) => {
  try {
    console.log('> Buscando todas as receitas...');
    
    const { data, error } = await supabase
      .from('recipes')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;

    return res.status(200).json(data);
  } catch (err) {
    console.error('Erro ao buscar receitas:', err.message);
    return res.status(500).json({ message: 'Erro ao buscar receitas' });
  }
});

app.get('/recipes/:id', authenticateUser, async (req, res) => {
  const { id } = req.params;

  try {
    console.log(`> Buscando receita ID: ${id}`);

    const { data, error } = await supabase
      .from('recipes')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return res.status(404).json({ message: 'Receita não encontrada' });
      }
      throw error;
    }

    return res.status(200).json(data);
  } catch (err) {
    console.error('Erro ao buscar receita:', err.message);
    return res.status(500).json({ message: 'Erro ao buscar receita' });
  }
});

app.put('/recipes/:id', authenticateUser, upload.single('image'), async (req, res) => {
  const { id } = req.params;

  try {
    const {
      title,
      category,
      meal_type,
      ingredients,
      instructions,
      prep_time,
      calories,
      published
    } = req.body;

    console.log(`> Atualizando receita ID: ${id}`);
    let image_url = null;

    if (req.file) {
      const fileExt = path.extname(req.file.originalname);
      const fileName = `${Date.now()}-${Math.random().toString(36).substring(2)}${fileExt}`;
      const filePath = `recipes/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('recipe-images')
        .upload(filePath, req.file.buffer, {
          contentType: req.file.mimetype,
          upsert: false
        });

      if (uploadError) throw uploadError;

      const { data: publicUrlData } = supabase
        .storage
        .from('recipe-images')
        .getPublicUrl(filePath);

      image_url = publicUrlData.publicUrl;
    }

    const updatePayload = {
      ...(title && { title }),
      ...(category && { category }),
      ...(meal_type && { meal_type }),
      ...(ingredients && { ingredients }),
      ...(instructions && { instructions }),
      ...(prep_time && { prep_time: parseInt(prep_time) || 0 }),
      ...(calories && { calories: parseInt(calories) || 0 }),
      ...(published !== undefined && { published: published === 'true' }),
      ...(image_url && { image_url })
    };

    const { error } = await supabase
      .from('recipes')
      .update(updatePayload)
      .eq('id', id);

    if (error) throw error;

    return res.status(200).json({ message: 'Receita atualizada com sucesso' });

  } catch (err) {
    console.error('Erro ao atualizar receita:', err.message);
    return res.status(500).json({ message: 'Erro ao atualizar receita' });
  }
});

app.delete('/recipes/:id', authenticateUser, async (req, res) => {
  const { id } = req.params;

  try {
    console.log(`> Deletando receita ID: ${id}`);

    // (Opcional) Buscar imagem antes de deletar
    const { data: recipe, error: fetchError } = await supabase
      .from('recipes')
      .select('image_url')
      .eq('id', id)
      .single();

    if (fetchError) throw fetchError;

    // Deletar do banco
    const { error } = await supabase
      .from('recipes')
      .delete()
      .eq('id', id);

    if (error) throw error;

    // Deletar imagem se existir
    if (recipe?.image_url) {
      const path = recipe.image_url.split('/storage/v1/object/public/recipe-images/')[1];
      if (path) {
        await supabase.storage.from('recipe-images').remove([`recipes/${path}`]);
        console.log('> Imagem associada removida:', path);
      }
    }

    return res.status(200).json({ message: 'Receita deletada com sucesso' });

  } catch (err) {
    console.error('Erro ao deletar receita:', err.message);
    return res.status(500).json({ message: 'Erro ao deletar receita' });
  }
});


app.get('/daily-meals', authenticateUser, async (req, res) => {
  const userId = req.user.id;
  const dateParam = req.query.date; // formato: YYYY-MM-DD

  if (!dateParam) {
    return res.status(400).json({ message: 'Parâmetro ?date=YYYY-MM-DD é obrigatório' });
  }

  const targetDate = new Date(dateParam);
  if (isNaN(targetDate)) {
    return res.status(400).json({ message: 'Data inválida' });
  }

  // Início e fim do dia (UTC)
  const startOfDay = new Date(targetDate);
  startOfDay.setUTCHours(0, 0, 0, 0);
  const endOfDay = new Date(targetDate);
  endOfDay.setUTCHours(23, 59, 59, 999);

  // Buscar refeições existentes
  const { data: existingMeals, error: fetchError } = await supabase
    .from('daily_meals')
    .select('*, recipes(*)')
    .eq('user_id', userId)
    .gte('created_at', startOfDay.toISOString())
    .lte('created_at', endOfDay.toISOString());

  if (fetchError) {
    console.error('Erro ao buscar refeições:', fetchError.message);
    return res.status(500).json({ message: 'Erro ao buscar refeições' });
  }

  const mealTypes = ['Breakfast', 'Lunch', 'Dinner', 'Snack', 'Snack'];
  const newMeals = [];

  if (existingMeals.length < 5) {
    for (let type of mealTypes) {
      if (existingMeals.find(m => m.meal_type === type)) continue;

      const { data: options, error: recipeError } = await supabase
        .from('recipes')
        .select('*')
        .eq('meal_type', type);

      if (recipeError || !options?.length) continue;

      const recipe = options[Math.floor(Math.random() * options.length)];

      const { data: inserted, error: insertError } = await supabase
        .from('daily_meals')
        .insert({
          user_id: userId,
          recipe_id: recipe.id,
          meal_type: type,
          created_at: startOfDay.toISOString()
        })
        .select('*, recipes(*)');

      if (!insertError && inserted?.length) {
        newMeals.push(inserted[0]);
      }
    }
  }

  // Buscar favoritos do usuário
  const { data: favorites, error: favError } = await supabase
    .from('favorites')
    .select('recipe_id')
    .eq('user_id', userId);

  if (favError) {
    console.error('Erro ao buscar favoritos:', favError.message);
    return res.status(500).json({ message: 'Erro ao buscar favoritos' });
  }

  const favoriteIds = favorites.map(f => f.recipe_id);

  // Unir refeições e marcar favoritos
  const allMeals = [...existingMeals, ...newMeals].map(meal => ({
    ...meal,
    favorited: favoriteIds.includes(meal.recipe_id)
  }));

  // Ordenar por tipo
  const ordered = allMeals.sort((a, b) => {
    const order = ['Breakfast', 'Lunch', 'Dinner', 'Snack'];
    return order.indexOf(a.meal_type) - order.indexOf(b.meal_type);
  });

  return res.status(200).json(ordered);
});



app.post('/daily-meals/:id/swap', authenticateUser, async (req, res) => {
  const userId = req.user.id;
  const { id } = req.params;

  // Buscar tipo de refeição e receita atual
  const { data: current, error: fetchError } = await supabase
    .from('daily_meals')
    .select('meal_type, recipe_id')
    .eq('id', id)
    .eq('user_id', userId)
    .single();

  if (fetchError || !current) {
    return res.status(404).json({ message: 'Refeição não encontrada' });
  }

  // Buscar outras receitas do mesmo tipo, exceto a atual
  const { data: options, error: recipeError } = await supabase
    .from('recipes')
    .select('*')
    .eq('meal_type', current.meal_type)
    .neq('id', current.recipe_id); // ⚠️ exclui a atual

  if (recipeError || !options || options.length === 0) {
    return res.status(500).json({ message: 'Não foi possível trocar a receita' });
  }

  // Escolher aleatoriamente uma nova receita
  const newRecipe = options[Math.floor(Math.random() * options.length)];

  // Atualizar a daily_meal com nova receita
  const { data: updated, error: updateError } = await supabase
    .from('daily_meals')
    .update({ recipe_id: newRecipe.id })
    .eq('id', id)
    .eq('user_id', userId)
    .select('*, recipes(*)');

  if (updateError) {
    return res.status(500).json({ message: updateError.message });
  }

  return res.status(200).json(updated[0]);
});

app.post('/meal-logs', authenticateUser, async (req, res) => {
  const userId = req.user.id;
  const { meal_id } = req.body;

  if (!meal_id) {
    return res.status(400).json({ message: 'ID da refeição é obrigatório' });
  }

  const { error } = await supabase
    .from('meal_logs')
    .insert({
      user_id: userId,
      meal_id: meal_id,
      logged_at: new Date().toISOString()
    });

  if (error) return res.status(500).json({ message: error.message });

  res.status(200).json({ message: 'Refeição logada com sucesso' });
});


app.get('/api/session', authenticateUser, (req, res) => {
  return res.status(200).json({
    authenticated: true,
    user: {
      id: req.user.id,
      email: req.user.email
    }
  });
});

app.post('/favorites/toggle', authenticateUser, async (req, res) => {
  const userId = req.user.id;
  const { recipe_id } = req.body;

  if (!recipe_id) {
    return res.status(400).json({ message: 'recipe_id é obrigatório' });
  }

  try {
    // Verifica se já está favoritado
    const { data: existing, error: fetchError } = await supabase
      .from('favorites')
      .select('*')
      .eq('user_id', userId)
      .eq('recipe_id', recipe_id)
      .single();

    if (fetchError && fetchError.code !== 'PGRST116') {
      throw fetchError;
    }

    if (existing) {
      // Já existe, então remove
      const { error: deleteError } = await supabase
        .from('favorites')
        .delete()
        .eq('user_id', userId)
        .eq('recipe_id', recipe_id);

      if (deleteError) throw deleteError;

      return res.status(200).json({ favorited: false });
    } else {
      // Não existe, então adiciona
      const { error: insertError } = await supabase
        .from('favorites')
        .insert([{ user_id: userId, recipe_id }]);

      if (insertError) throw insertError;

      return res.status(201).json({ favorited: true });
    }
  } catch (err) {
    console.error('Erro no toggle de favorito:', err.message);
    return res.status(500).json({ message: 'Erro ao processar favorito' });
  }
});

app.get('/favorites', authenticateUser, async (req, res) => {
  try {
    const userId = req.user.id;
    console.log(`[GET /favorites] → Buscando favoritos do usuário ${userId}`);

    // Pega os favoritos do usuário, e faz join com os dados da receita
    const { data, error } = await supabase
      .from('favorites')
      .select(`
        recipe_id,
        recipes (
          id,
          title,
          category,
          prep_time,
          image_url
        )
      `)
      .eq('user_id', userId);

    if (error) {
      console.error('[GET /favorites] → Erro na query:', error.message);
      return res.status(500).json({ message: 'Erro ao buscar favoritos' });
    }

    // Filtra receitas válidas (caso algum join venha nulo)
    const recipes = data
      .filter(fav => fav.recipes)
      .map(fav => fav.recipes);

    return res.status(200).json(recipes);
  } catch (err) {
    console.error('[GET /favorites] → Erro inesperado:', err.message);
    return res.status(500).json({ message: 'Erro inesperado ao buscar favoritos' });
  }
});

app.post('/shopping-list', authenticateUser, async (req, res) => {
  const userId = req.user.id;
  const { date, items } = req.body;

  if (!date || !items) {
    return res.status(400).json({ message: 'date e items são obrigatórios' });
  }

  try {
    const { error } = await supabase
      .from('shopping_list')
      .upsert({ user_id: userId, date, items }, { onConflict: ['user_id', 'date'] });

    if (error) throw error;

    return res.status(200).json({ message: 'Lista salva com sucesso' });
  } catch (err) {
    console.error('[POST /shopping-list] →', err.message);
    return res.status(500).json({ message: 'Erro ao salvar lista' });
  }
});

app.get('/shopping-list', authenticateUser, async (req, res) => {
  const userId = req.user.id;
  const { date } = req.query;

  if (!date) {
    return res.status(400).json({ message: 'Parâmetro ?date= é obrigatório' });
  }

  try {
    const { data, error } = await supabase
      .from('shopping_list')
      .select('*')
      .eq('user_id', userId)
      .eq('date', date)
      .single();

    if (error && error.code !== 'PGRST116') throw error;

    return res.status(200).json(data || { items: '' });
  } catch (err) {
    console.error('[GET /shopping-list] →', err.message);
    return res.status(500).json({ message: 'Erro ao buscar lista' });
  }
});


app.put('/shopping-list/:id', authenticateUser, async (req, res) => {
  const userId = req.user.id;
  const { id } = req.params;
  const { items } = req.body;

  if (!items) {
    return res.status(400).json({ message: 'Campo items é obrigatório' });
  }

  try {
    const { error } = await supabase
      .from('shopping_list')
      .update({ items })
      .eq('id', id)
      .eq('user_id', userId);

    if (error) throw error;

    return res.status(200).json({ message: 'Lista atualizada com sucesso' });
  } catch (err) {
    console.error('[PUT /shopping-list] →', err.message);
    return res.status(500).json({ message: 'Erro ao atualizar lista' });
  }
});

app.delete('/shopping-list/:id', authenticateUser, async (req, res) => {
  const userId = req.user.id;
  const { id } = req.params;

  try {
    const { error } = await supabase
      .from('shopping_list')
      .delete()
      .eq('id', id)
      .eq('user_id', userId);

    if (error) throw error;

    return res.status(200).json({ message: 'Lista deletada com sucesso' });
  } catch (err) {
    console.error('[DELETE /shopping-list] →', err.message);
    return res.status(500).json({ message: 'Erro ao deletar lista' });
  }
});

app.post('/glucose-walk', authenticateUser, upload.single('image'), async (req, res) => {
  console.log('[POST] /glucose-walk - chamada recebida');

  const { title, text, references_text } = req.body;
  console.log('> Body recebido:', { title, text, references_text });

  let image_url = null;

  if (!title || !text) {
    console.warn('⚠️ Título ou texto ausente');
    return res.status(400).json({ message: 'Título e texto são obrigatórios' });
  }

  if (req.file) {
    console.log('> Arquivo recebido:', {
      originalname: req.file.originalname,
      mimetype: req.file.mimetype,
      size: req.file.size
    });

    const ext = path.extname(req.file.originalname);
    const fileName = `${Date.now()}-${Math.random().toString(36).substring(2)}${ext}`;
    const filePath = `glucose_walk/${fileName}`;

    const { error: uploadError } = await supabase.storage
      .from('glucose-images')
      .upload(filePath, req.file.buffer, {
        contentType: req.file.mimetype,
        upsert: false
      });

    if (uploadError) {
      console.error('❌ Erro ao subir imagem:', uploadError.message);
      return res.status(500).json({ message: 'Erro ao salvar imagem' });
    }

    const { data } = supabase.storage.from('glucose-images').getPublicUrl(filePath);
    image_url = data.publicUrl;
    console.log('> Imagem salva em:', image_url);
  }

  const { error } = await supabase
    .from('glucose_walk')
    .insert([{ title, text, references_text, image_url }]);

  if (error) {
    console.error('❌ Erro ao inserir no banco:', error.message);
    return res.status(500).json({ message: 'Erro ao salvar dado' });
  }

  console.log('✅ Glucose Walk inserido com sucesso');
  return res.status(201).json({ message: 'Glucose Walk salvo com sucesso' });
});


app.get('/glucose-walk', authenticateUser, async (req, res) => {
  const { data, error } = await supabase
    .from('glucose_walk')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) return res.status(500).json({ message: 'Erro ao buscar dados' });
  return res.status(200).json(data);
});

app.get('/glucose-walk/:id', authenticateUser, async (req, res) => {
  const { id } = req.params;

  const { data, error } = await supabase
    .from('glucose_walk')
    .select('*')
    .eq('id', id)
    .single();

  if (error) {
    console.error(`❌ Erro ao buscar entrada com ID ${id}:`, error.message);
    return res.status(404).json({ message: 'Entrada não encontrada' });
  }

  return res.status(200).json(data);
});

app.put('/glucose-walk/:id', authenticateUser, upload.single('image'), async (req, res) => {
  const { id } = req.params;
  const { title, text, references_text } = req.body;
  let image_url;

  if (req.file) {
    const ext = path.extname(req.file.originalname);
    const fileName = `${Date.now()}-${Math.random().toString(36).substring(2)}${ext}`;
    const filePath = `glucose_walk/${fileName}`;

    const { error: uploadError } = await supabase.storage
      .from('glucose-images')
      .upload(filePath, req.file.buffer, {
        contentType: req.file.mimetype,
        upsert: false
      });

    if (uploadError) return res.status(500).json({ message: 'Erro ao salvar imagem' });

    const { data } = supabase.storage.from('glucose-images').getPublicUrl(filePath);
    image_url = data.publicUrl;
  }

  const updatePayload = {
    ...(title && { title }),
    ...(text && { text }),
    ...(references_text && { references_text }),
    ...(image_url && { image_url })
  };

  const { error } = await supabase
    .from('glucose_walk')
    .update(updatePayload)
    .eq('id', id);

  if (error) return res.status(500).json({ message: 'Erro ao atualizar dado' });

  return res.status(200).json({ message: 'Atualizado com sucesso' });
});
app.delete('/glucose-walk/:id', authenticateUser, async (req, res) => {
  const { id } = req.params;

  const { data: item, error: fetchError } = await supabase
    .from('glucose_walk')
    .select('image_url')
    .eq('id', id)
    .single();

  if (fetchError) return res.status(404).json({ message: 'Item não encontrado' });

  const { error: deleteError } = await supabase
    .from('glucose_walk')
    .delete()
    .eq('id', id);

  if (deleteError) return res.status(500).json({ message: 'Erro ao deletar' });

  if (item?.image_url) {
    const relativePath = item.image_url.split('/storage/v1/object/public/glucose-images/')[1];
    if (relativePath) {
      await supabase.storage.from('glucose-images').remove([`glucose_walk/${relativePath}`]);
    }
  }

  return res.status(200).json({ message: 'Item deletado com sucesso' });
});
