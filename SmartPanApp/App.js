import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';

// Cook tab
import HomeScreen from './screens/HomeScreen';
import MeatSelectionScreen from './screens/MeatSelectionScreen';
import DimensionsScreen from './screens/DimensionsScreen';
import DonenessScreen from './screens/DonenessScreen';
import CookingGuideScreen from './screens/CookingGuideScreen';

// Macros tab
import MacrosScreen from './screens/MacrosScreen';
import FoodSearchScreen from './screens/FoodSearchScreen';
import FoodDetailScreen from './screens/FoodDetailScreen';

// Recipes tab
import RecipesScreen from './screens/RecipesScreen';
import RecipeDetailScreen from './screens/RecipeDetailScreen';
import CreateRecipeScreen from './screens/CreateRecipeScreen';

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

function HomeStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Home" component={HomeScreen} />
      <Stack.Screen name="MeatSelection" component={MeatSelectionScreen} />
      <Stack.Screen name="Dimensions" component={DimensionsScreen} />
      <Stack.Screen name="Doneness" component={DonenessScreen} />
      <Stack.Screen name="CookingGuide" component={CookingGuideScreen} />
    </Stack.Navigator>
  );
}

function MacrosStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Macros" component={MacrosScreen} />
      <Stack.Screen name="FoodSearch" component={FoodSearchScreen} />
      <Stack.Screen name="FoodDetail" component={FoodDetailScreen} />
    </Stack.Navigator>
  );
}

function RecipesStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="RecipesList" component={RecipesScreen} />
      <Stack.Screen name="RecipeDetail" component={RecipeDetailScreen} />
      <Stack.Screen name="CreateRecipe" component={CreateRecipeScreen} />
      {/* Separate screen names so recipe + macro food searches don't share state */}
      <Stack.Screen name="FoodSearchRecipe" component={FoodSearchScreen} />
      <Stack.Screen name="FoodDetailRecipe" component={FoodDetailScreen} />
    </Stack.Navigator>
  );
}

export default function App() {
  return (
    <NavigationContainer>
      <Tab.Navigator
        screenOptions={({ route }) => ({
          headerShown: false,
          tabBarStyle: {
            backgroundColor: '#0f0f0f',
            borderTopColor: '#2a2a2a',
            paddingBottom: 5,
            height: 60,
          },
          tabBarActiveTintColor: '#FF6B35',
          tabBarInactiveTintColor: '#555',
          tabBarIcon: ({ focused, color, size }) => {
            const icons = {
              Cook: focused ? 'flame' : 'flame-outline',
              Macros: focused ? 'nutrition' : 'nutrition-outline',
              Recipes: focused ? 'book' : 'book-outline',
            };
            return <Ionicons name={icons[route.name]} size={size} color={color} />;
          },
        })}
      >
        <Tab.Screen name="Cook" component={HomeStack} />
        <Tab.Screen name="Macros" component={MacrosStack} />
        <Tab.Screen name="Recipes" component={RecipesStack} />
      </Tab.Navigator>
    </NavigationContainer>
  );
}
